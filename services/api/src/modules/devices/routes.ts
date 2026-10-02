import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DeviceProvider, DeviceStatus, DeviceType, isInternalUser } from "@skyarc/shared";
import { createDeviceBodySchema, uuidSchema } from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { canWriteLocation, isReadOnly, canAccessLocation } from "../../lib/rbac.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { requestOrbitClaim } from "../../lib/orbit-client.js";
import { assignDeviceToScreen } from "../../lib/orbit/device-mapping.js";
import {
  buildCampaignOrbitEvidence,
  createOperationalRiskSnapshot,
} from "../../lib/orbit/campaign-evidence.js";
import { assertCanAccessCampaign, assertCanMutateCampaign } from "../../lib/campaign-access.js";
import { requireTenantUnlessInternal } from "../../lib/tenant-context.js";

function serializeDevice(d: {
  id: string;
  screenId: string;
  organizationId: string | null;
  provider: string;
  deviceType: string;
  externalId: string;
  status: string;
  summaryJson: unknown;
  lastEventAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d.id,
    screenId: d.screenId,
    organizationId: d.organizationId,
    provider: d.provider,
    deviceType: d.deviceType,
    externalId: d.externalId,
    status: d.status,
    summaryJson: d.summaryJson,
    lastEventAt: d.lastEventAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export async function deviceRoutes(fastify: FastifyInstance, env: Env) {
  fastify.get(
    "/screens/:id/devices",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const screenId = uuidSchema.parse((request.params as { id: string }).id);
      const screen = await prisma.screen.findUnique({
        where: { id: screenId },
        include: { location: true },
      });
      if (!screen) throw notFound("Screen not found");
      if (!canAccessLocation(request.user, screen.location)) throw forbidden();
      const devices = await prisma.device.findMany({
        where: { screenId },
        orderBy: { createdAt: "asc" },
      });
      return success(devices.map(serializeDevice));
    }
  );

  fastify.get(
    "/screens/:id/orbit-status",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const screenId = uuidSchema.parse((request.params as { id: string }).id);
      const screen = await prisma.screen.findUnique({
        where: { id: screenId },
        include: { location: true },
      });
      if (!screen) throw notFound("Screen not found");
      if (!canAccessLocation(request.user, screen.location)) throw forbidden();

      const device = await prisma.device.findFirst({
        where: { screenId, provider: DeviceProvider.ORBIT },
        orderBy: { createdAt: "desc" },
      });
      if (!device) {
        return success({ attached: false as const, skyarcScreenCode: screen.skyarcScreenCode });
      }
      return success({
        attached: true as const,
        skyarcScreenCode: screen.skyarcScreenCode,
        device: serializeDevice(device),
      });
    }
  );

  fastify.post(
    "/screens/:id/devices",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const screenId = uuidSchema.parse((request.params as { id: string }).id);
      const screen = await prisma.screen.findUnique({
        where: { id: screenId },
        include: { location: true },
      });
      if (!screen) throw notFound("Screen not found");
      if (!canWriteLocation(request.user, screen.location) || isReadOnly(request.user)) {
        throw forbidden();
      }
      if (!screen.skyarcScreenCode) {
        throw validationError("Screen must have skyarcScreenCode before attaching a device");
      }

      const body = createDeviceBodySchema.parse(request.body);
      const provider = body.provider;
      const deviceType = body.deviceType;

      if (provider === DeviceProvider.ORBIT) {
        try {
          const tenantId = screen.location.organizationId;
          if (!tenantId) {
            throw validationError(
              "Location must have organizationId before attaching an Orbit device (tenant identity)"
            );
          }
          const claim = await requestOrbitClaim(env, {
            atlasScreenId: screen.id,
            skyarcScreenCode: screen.skyarcScreenCode,
            deviceType,
            tenantId,
          });
          const device = await prisma.device.create({
            data: {
              screenId,
              organizationId: screen.location.organizationId,
              provider,
              deviceType,
              externalId: claim.orbitDeviceId,
              status: DeviceStatus.PENDING,
              summaryJson: { claimCode: claim.claimCode, claimExpiresAt: claim.expiresAt },
            },
          });
          await prisma.screenExternalId.upsert({
            where: {
              provider_idType_externalId: {
                provider: DeviceProvider.ORBIT,
                idType: "orbit_device",
                externalId: claim.orbitDeviceId,
              },
            },
            create: {
              screenId,
              provider: DeviceProvider.ORBIT,
              idType: "orbit_device",
              externalId: claim.orbitDeviceId,
            },
            update: { screenId },
          });
          await assignDeviceToScreen(prisma, {
            deviceId: device.id,
            screenId,
            tenantOrganizationId: screen.location.organizationId,
            reason: "initial_attach",
            actorUserId: request.user.id,
          });
          return success({
            device: serializeDevice(device),
            provision: {
              claimCode: claim.claimCode,
              expiresAt: claim.expiresAt,
              orbitDeviceId: claim.orbitDeviceId,
            },
          });
        } catch (err) {
          throw validationError(err instanceof Error ? err.message : "Orbit provisioning failed");
        }
      }

      const externalId = body.externalId?.trim();
      if (!externalId) {
        throw validationError("externalId is required for non-Orbit devices");
      }
      const device = await prisma.device.create({
        data: {
          screenId,
          organizationId: screen.location.organizationId,
          provider,
          deviceType: deviceType || DeviceType.OTHER,
          externalId,
          status: DeviceStatus.UNKNOWN,
        },
      });
      await prisma.screenExternalId.upsert({
        where: {
          provider_idType_externalId: {
            provider,
            idType: "external",
            externalId,
          },
        },
        create: {
          screenId,
          provider,
          idType: "external",
          externalId,
        },
        update: { screenId },
      });
      await assignDeviceToScreen(prisma, {
        deviceId: device.id,
        screenId,
        tenantOrganizationId: screen.location.organizationId,
        reason: "initial_attach",
        actorUserId: request.user.id,
      });
      return success({ device: serializeDevice(device) });
    }
  );

  /** Relocate device to another screen (effective-dated; closes prior open mapping). */
  fastify.post(
    "/devices/:id/relocate",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!isInternalUser(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const body = z
        .object({
          screenId: z.string().uuid(),
          validFrom: z.string().datetime().optional(),
          reason: z.string().max(200).optional(),
        })
        .parse(request.body ?? {});
      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) throw notFound("Device not found");
      const screen = await prisma.screen.findUnique({
        where: { id: body.screenId },
        include: { location: true },
      });
      if (!screen) throw notFound("Screen not found");
      if (!canWriteLocation(request.user, screen.location)) throw forbidden();

      const result = await assignDeviceToScreen(prisma, {
        deviceId: id,
        screenId: body.screenId,
        tenantOrganizationId: screen.location.organizationId,
        validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
        reason: body.reason ?? "relocate",
        actorUserId: request.user.id,
      });
      return success({
        mapping: {
          id: result.mapping.id,
          deviceId: result.mapping.deviceId,
          screenId: result.mapping.screenId,
          validFrom: result.mapping.validFrom.toISOString(),
          validTo: result.mapping.validTo?.toISOString() ?? null,
        },
        relocated: result.relocated,
        closedConflicts: result.closedConflicts,
      });
    }
  );

  fastify.get(
    "/campaigns/:campaignId/orbit-evidence",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!isInternalUser(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse(
        (request.params as { campaignId: string }).campaignId
      );
      await assertCanAccessCampaign(request.user, campaignId);
      const evidence = await buildCampaignOrbitEvidence(prisma, env, campaignId);
      if ("error" in evidence) throw notFound(evidence.error);
      return success(evidence);
    }
  );

  fastify.post(
    "/campaigns/:campaignId/orbit-evidence/snapshots",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!isInternalUser(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse(
        (request.params as { campaignId: string }).campaignId
      );
      await assertCanMutateCampaign(request.user, campaignId);
      const evidence = await buildCampaignOrbitEvidence(prisma, env, campaignId);
      if ("error" in evidence) throw notFound(evidence.error);
      const tenantId = requireTenantUnlessInternal(request.user);
      const snap = await createOperationalRiskSnapshot(prisma, {
        campaignId,
        tenantOrganizationId: tenantId,
        evidence,
        actorUserId: request.user.id,
      });
      return success({
        snapshot: {
          id: snap.snapshot.id,
          version: snap.snapshot.version,
          createdAt: snap.snapshot.createdAt.toISOString(),
          source: snap.snapshot.source,
        },
        note: "Versioned operational-risk snapshot — not audience forecast or verified delivery",
      });
    }
  );
}
