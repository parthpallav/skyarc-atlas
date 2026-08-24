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
} from "@skyarc/shared";
import { MEDIA_LIMITS } from "@skyarc/config";
import type { StorageProvider } from "../../lib/storage/index.js";
import { prisma } from "../../lib/prisma.js";
import { success, toIso } from "../../lib/response.js";
import { canWriteLocation, isReadOnly } from "../../lib/rbac.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { resolveAssetUrl } from "../../lib/asset-url.js";
import { invalidateLocationCaches } from "../../lib/cache/location-cache.js";

async function serializeAsset(
  asset: {
    id: string;
    locationId: string;
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

const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

function registerImageBodyParsers(fastify: FastifyInstance) {
  const parseBuffer = (
    _req: unknown,
    body: Buffer,
    done: (err: Error | null, body?: Buffer) => void
  ) => {
    done(null, body);
  };

  for (const contentType of IMAGE_CONTENT_TYPES) {
    if (fastify.hasContentTypeParser(contentType)) continue;
    fastify.addContentTypeParser(
      contentType,
      { parseAs: "buffer", bodyLimit: MEDIA_LIMITS.maxImageBytes },
      parseBuffer
    );
  }
}

export async function assetRoutes(
  fastify: FastifyInstance,
  storage: StorageProvider,
  env: Env
) {
  registerImageBodyParsers(fastify);

  fastify.get(
    "/locations/:id/assets",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const assets = await prisma.locationAsset.findMany({
        where: { locationId },
      });
      const sorted = sortAssetsByView(assets);
      return success(
        await Promise.all(sorted.map((a) => serializeAsset(a, env, storage)))
      );
    }
  );

  fastify.post(
    "/locations/:id/assets/presign",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canWriteLocation(request.user, location.createdByUserId) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const body = presignAssetBodySchema.parse(request.body);
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

      if (view !== PhotoView.OTHER) {
        await prisma.locationAsset.deleteMany({
          where: { locationId, view },
        });
      }

      await prisma.locationAsset.upsert({
        where: { id: body.assetId },
        create: {
          id: body.assetId,
          locationId,
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
      if (!canWriteLocation(request.user, location.createdByUserId) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const body = confirmAssetBodySchema.parse(request.body ?? {});
      const asset = await prisma.locationAsset.findFirst({
        where: { id: assetId, locationId },
      });
      if (!asset) throw notFound("Asset not found");

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
      if (!canWriteLocation(request.user, location.createdByUserId) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const query = uploadAssetQuerySchema.parse(request.query);
      const contentType = request.headers["content-type"] ?? "image/jpeg";
      if (!contentType.startsWith("image/")) {
        throw validationError("Content-Type must be an image");
      }

      const body = request.body;
      if (!body || !Buffer.isBuffer(body) || body.length === 0) {
        throw validationError("Image body is required");
      }
      if (body.length > MEDIA_LIMITS.maxImageBytes) {
        throw validationError(`File exceeds max size of ${MEDIA_LIMITS.maxImageBytes} bytes`);
      }

      const view = query.view;
      const assetId = randomUUID();
      const locationFolder = slugifyLocationFolder(location.name, locationId);
      const r2Key = buildAssetKey({
        locationFolder,
        kind: AssetKind.PHOTO,
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
          kind: AssetKind.PHOTO,
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
}
