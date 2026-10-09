import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { Env } from "@skyarc/config";
import {
  confirmAssetBodySchema,
  presignAssetBodySchema,
  uploadAssetQuerySchema,
  uuidSchema,
} from "@skyarc/validation";
import {
  AssetKind,
  PhotoView,
  UploadStatus,
  buildAssetKey,
  photoViewSortKey,
  resolvePhotoView,
  slugifyLocationFolder,
  PHOTO_VIEW_LABELS,
  isLocationMediaContentType,
  maxBytesForContentType,
  VIDEO_CONTENT_TYPES,
  IMAGE_CONTENT_TYPES,
} from "@skyarc/shared";
import { MEDIA_LIMITS } from "@skyarc/config";
import type { StorageProvider } from "../../lib/storage/index.js";
import { prisma } from "../../lib/prisma.js";
import { success, toIso } from "../../lib/response.js";
import { canAccessLocation, canWriteLocation, isReadOnly } from "../../lib/rbac.js";
import { isClientUser } from "@skyarc/shared";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { resolveAssetUrl } from "../../lib/asset-url.js";
import { invalidateLocationCaches } from "../../lib/cache/location-cache.js";
import {
  assertCanMutateLiveProof,
  listLiveProofTargetCampaigns,
} from "../../lib/live-proof.js";
import { journeyGapsEnabled } from "../../lib/journey-gaps.js";

async function serializeAsset(
  asset: {
    id: string;
    locationId: string;
    campaignId?: string | null;
    kind: string;
    view: string;
    r2Key: string;
    contentType: string;
    byteSize: number | null;
    checksumSha256: string | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    capturedAt: Date | null;
    capturedLat: number | null;
    capturedLng: number | null;
    uploadStatus: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  env: Env,
  storage: StorageProvider
) {
  const url = await resolveAssetUrl(env, storage, asset.r2Key, asset.uploadStatus);
  const view = asset.view as PhotoView;
  return {
    id: asset.id,
    locationId: asset.locationId,
    campaignId: asset.campaignId ?? null,
    kind: asset.kind,
    view,
    viewLabel: PHOTO_VIEW_LABELS[view] ?? view,
    sortOrder: photoViewSortKey(view),
    r2Key: asset.r2Key,
    url,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    checksumSha256: asset.checksumSha256,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    capturedAt: toIso(asset.capturedAt),
    capturedLat: asset.capturedLat,
    capturedLng: asset.capturedLng,
    uploadStatus: asset.uploadStatus,
    confirmedAt: toIso(asset.confirmedAt),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function maxBytesForKind(kind: AssetKind): number {
  if (kind === AssetKind.APPROACH_VIDEO) return MEDIA_LIMITS.maxVideoBytes;
  if (kind === AssetKind.VOICE_NOTE) return MEDIA_LIMITS.maxVoiceBytes;
  return MEDIA_LIMITS.maxImageBytes;
}

function sortAssetsByView<T extends { view: string }>(assets: T[]): T[] {
  return [...assets].sort(
    (a, b) => photoViewSortKey(a.view) - photoViewSortKey(b.view)
  );
}

const IMAGE_CONTENT_TYPES_LIST = [...IMAGE_CONTENT_TYPES];
const VIDEO_CONTENT_TYPES_LIST = [...VIDEO_CONTENT_TYPES];

function registerMediaBodyParsers(fastify: FastifyInstance) {
  const parseBuffer = (
    _req: unknown,
    body: Buffer,
    done: (err: Error | null, body?: Buffer) => void
  ) => {
    done(null, body);
  };

  for (const contentType of IMAGE_CONTENT_TYPES_LIST) {
    if (fastify.hasContentTypeParser(contentType)) continue;
    fastify.addContentTypeParser(
      contentType,
      { parseAs: "buffer", bodyLimit: MEDIA_LIMITS.maxImageBytes },
      parseBuffer
    );
  }

  for (const contentType of VIDEO_CONTENT_TYPES_LIST) {
    if (fastify.hasContentTypeParser(contentType)) continue;
    fastify.addContentTypeParser(
      contentType,
      { parseAs: "buffer", bodyLimit: MEDIA_LIMITS.maxVideoBytes },
      parseBuffer
    );
  }
}

function assetKindForViewUpload(_contentType: string): AssetKind {
  // View-slot uploads (image or video) share the same per-view R2 path.
  return AssetKind.PHOTO;
}

export async function assetRoutes(
  fastify: FastifyInstance,
  storage: StorageProvider,
  env: Env
) {
  registerMediaBodyParsers(fastify);

  fastify.get(
    "/locations/:id/assets",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canAccessLocation(request.user, location)) throw forbidden();
      let assets = await prisma.locationAsset.findMany({
        where: { locationId },
      });
      // Clients: live proofs only for campaigns they created (align with plan-history redaction).
      if (isClientUser(request.user)) {
        const liveProofs = assets.filter((a) => a.kind === AssetKind.CAMPAIGN_LIVE_PROOF);
        const other = assets.filter((a) => a.kind !== AssetKind.CAMPAIGN_LIVE_PROOF);
        const campaignIds = [
          ...new Set(
            liveProofs
              .map((a) => a.campaignId)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const owned =
          campaignIds.length > 0
            ? await prisma.campaign.findMany({
                where: {
                  id: { in: campaignIds },
                  createdByUserId: request.user.id,
                },
                select: { id: true },
              })
            : [];
        const ownedSet = new Set(owned.map((c) => c.id));
        assets = [
          ...other,
          ...liveProofs.filter(
            (a) => a.campaignId != null && ownedSet.has(a.campaignId)
          ),
        ];
      }
      const sorted = sortAssetsByView(assets);
      const serialized = await Promise.all(
        sorted.map((a) => serializeAsset(a, env, storage))
      );

      const proofCampaignIds = [
        ...new Set(
          serialized
            .filter((a) => a.kind === AssetKind.CAMPAIGN_LIVE_PROOF && a.campaignId)
            .map((a) => a.campaignId as string)
        ),
      ];
      const campaigns =
        proofCampaignIds.length > 0
          ? await prisma.campaign.findMany({
              where: { id: { in: proofCampaignIds } },
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
                advertiser: { select: { name: true } },
              },
            })
          : [];
      const campaignById = new Map(campaigns.map((c) => [c.id, c]));
      const redact = isClientUser(request.user);

      return success(
        serialized.map((a) => {
          if (a.kind !== AssetKind.CAMPAIGN_LIVE_PROOF || !a.campaignId) {
            return a;
          }
          const c = campaignById.get(a.campaignId);
          if (!c) return a;
          return {
            ...a,
            campaignName: redact ? null : c.name,
            advertiserName: redact ? null : c.advertiser.name,
            flightStart: c.startDate?.toISOString() ?? null,
            flightEnd: c.endDate?.toISOString() ?? null,
          };
        })
      );
    }
  );

  fastify.get(
    "/locations/:id/live-proof-targets",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canAccessLocation(request.user, location)) throw forbidden();
      if (isClientUser(request.user) || isReadOnly(request.user)) {
        return success({ campaigns: [] as const, canUpload: false });
      }
      if (!journeyGapsEnabled()) {
        return success({ campaigns: [] as const, canUpload: false });
      }
      const campaigns = await listLiveProofTargetCampaigns(locationId);
      return success({
        campaigns,
        canUpload: campaigns.length > 0,
      });
    }
  );

  fastify.post(
    "/locations/:id/assets/presign",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");

      const body = presignAssetBodySchema.parse(request.body);
      if (
        !canWriteLocation(request.user, location) ||
        isReadOnly(request.user)
      ) {
        throw forbidden();
      }
      if (body.kind === AssetKind.CAMPAIGN_LIVE_PROOF) {
        if (!body.campaignId) {
          throw validationError("campaignId is required for live campaign proof photos");
        }
        if (journeyGapsEnabled()) {
          await assertCanMutateLiveProof(request.user, location, body.campaignId);
        }
      }
      if (
        (body.kind === AssetKind.PHOTO || body.kind === AssetKind.CAMPAIGN_LIVE_PROOF) &&
        !isLocationMediaContentType(body.contentType)
      ) {
        throw validationError(
          "Photo assets must use an image or supported video content type"
        );
      }
      const maxBytes = maxBytesForKind(body.kind);
      if (body.byteSize > maxBytes) {
        throw validationError(`File exceeds max size of ${maxBytes} bytes`);
      }

      const locationFolder = slugifyLocationFolder(location.name, locationId);
      const view = resolvePhotoView(body.kind, body.view);
      const r2Key = buildAssetKey({
        locationFolder,
        kind: body.kind,
        view,
        assetId: body.assetId,
        contentType: body.contentType,
      });

      const presign = await storage.createPresignedUpload({
        key: r2Key,
        contentType: body.contentType,
        maxBytes: body.byteSize,
      });

      if (view !== PhotoView.OTHER && body.kind !== AssetKind.CAMPAIGN_LIVE_PROOF) {
        await prisma.locationAsset.deleteMany({
          where: { locationId, view },
        });
      }

      await prisma.locationAsset.upsert({
        where: { id: body.assetId },
        create: {
          id: body.assetId,
          locationId,
          campaignId: body.campaignId ?? null,
          kind: body.kind,
          view,
          r2Key,
          contentType: body.contentType,
          byteSize: body.byteSize,
          checksumSha256: body.checksumSha256,
          width: body.width,
          height: body.height,
          durationMs: body.durationMs,
          capturedAt: body.capturedAt ? new Date(body.capturedAt) : null,
          capturedLat: body.capturedLat,
          capturedLng: body.capturedLng,
          uploadStatus: UploadStatus.PENDING,
        },
        update: {
          kind: body.kind,
          view,
          campaignId: body.campaignId ?? null,
          r2Key,
          contentType: body.contentType,
          byteSize: body.byteSize,
          uploadStatus: UploadStatus.PENDING,
        },
      });

      return success({
        assetId: body.assetId,
        uploadUrl: presign.uploadUrl,
        r2Key,
        expiresAt: presign.expiresAt.toISOString(),
      });
    }
  );

  fastify.post(
    "/locations/:id/assets/:assetId/confirm",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const assetId = uuidSchema.parse((request.params as { assetId: string }).assetId);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");

      const body = confirmAssetBodySchema.parse(request.body ?? {});
      const asset = await prisma.locationAsset.findFirst({
        where: { id: assetId, locationId },
      });
      if (!asset) throw notFound("Asset not found");

      if (asset.kind === AssetKind.CAMPAIGN_LIVE_PROOF) {
        if (!asset.campaignId) throw forbidden();
        if (journeyGapsEnabled()) {
          await assertCanMutateLiveProof(request.user, location, asset.campaignId);
        } else if (!canWriteLocation(request.user, location) || isReadOnly(request.user)) {
          throw forbidden();
        }
      } else if (!canWriteLocation(request.user, location) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const head = await storage.headObject(asset.r2Key);
      if (!head) {
        throw validationError("Object not found in storage");
      }

      const assetUpdated = await prisma.locationAsset.update({
        where: { id: assetId },
        data: {
          uploadStatus: UploadStatus.UPLOADED,
          confirmedAt: new Date(),
          byteSize: body.byteSize ?? head.byteSize,
          checksumSha256: body.checksumSha256 ?? asset.checksumSha256,
        },
      });

      invalidateLocationCaches(locationId);
      return success(await serializeAsset(assetUpdated, env, storage));
    }
  );

  fastify.post(
    "/locations/:id/assets/upload",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canWriteLocation(request.user, location) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const query = uploadAssetQuerySchema.parse(request.query);
      const contentType = request.headers["content-type"] ?? "image/jpeg";
      if (!isLocationMediaContentType(contentType)) {
        throw validationError(
          "Content-Type must be an image (JPEG, PNG, WebP, HEIC) or video (MP4, MOV, WebM)"
        );
      }

      const body = request.body;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        throw validationError("Media body is required");
      }
      const maxBytes = maxBytesForContentType(contentType);
      if (body.length > maxBytes) {
        throw validationError(`File exceeds max size of ${maxBytes} bytes`);
      }

      const view = query.view;
      const assetId = randomUUID();
      const locationFolder = slugifyLocationFolder(location.name, locationId);
      const kind = assetKindForViewUpload(contentType);
      const r2Key = buildAssetKey({
        locationFolder,
        kind,
        view,
        assetId,
        contentType,
      });

      if (view !== PhotoView.OTHER) {
        await prisma.locationAsset.deleteMany({
          where: { locationId, view },
        });
      }

      await storage.putObject({ key: r2Key, body, contentType });

      const asset = await prisma.locationAsset.create({
        data: {
          id: assetId,
          locationId,
          kind,
          view,
          r2Key,
          contentType,
          byteSize: body.length,
          uploadStatus: UploadStatus.UPLOADED,
          confirmedAt: new Date(),
        },
      });

      invalidateLocationCaches(locationId);
      return success(await serializeAsset(asset, env, storage));
    }
  );

  fastify.delete(
    "/locations/:id/assets/:assetId",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const assetId = uuidSchema.parse((request.params as { assetId: string }).assetId);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");

      const asset = await prisma.locationAsset.findFirst({
        where: { id: assetId, locationId },
      });
      if (!asset) throw notFound("Asset not found");

      if (asset.kind === AssetKind.CAMPAIGN_LIVE_PROOF) {
        if (!asset.campaignId) throw forbidden();
        if (journeyGapsEnabled()) {
          await assertCanMutateLiveProof(request.user, location, asset.campaignId);
        } else if (!canWriteLocation(request.user, location) || isReadOnly(request.user)) {
          throw forbidden();
        }
      } else if (!canWriteLocation(request.user, location) || isReadOnly(request.user)) {
        throw forbidden();
      }

      await prisma.locationAsset.delete({ where: { id: assetId } });
      invalidateLocationCaches(locationId);
      return success({ id: assetId, view: asset.view, removed: true });
    }
  );
}
