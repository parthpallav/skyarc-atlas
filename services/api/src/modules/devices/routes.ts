import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import { DeviceProvider, DeviceStatus, DeviceType } from "@skyarc/shared";
import { createDeviceBodySchema, uuidSchema } from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { canWriteLocation, isReadOnly, canAccessLocation } from "../../lib/rbac.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { requestOrbitClaim } from "../../lib/orbit-client.js";

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
          const claim = await requestOrbitClaim(env, {
            atlasScreenId: screen.id,
            skyarcScreenCode: screen.skyarcScreenCode,
            deviceType,
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
      return success({ device: serializeDevice(device) });
    }
  );

  fastify.delete(
    "/devices/:id",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const device = await prisma.device.findUnique({
        where: { id },
        include: { screen: { include: { location: true } } },
      });
      if (!device) throw notFound("Device not found");
      if (
        !canWriteLocation(request.user, device.screen.location) ||
        isReadOnly(request.user)
      ) {
        throw forbidden();
      }

      await prisma.device.delete({ where: { id } });
      await prisma.screenExternalId.deleteMany({
        where: {
          screenId: device.screenId,
          provider: device.provider,
          externalId: device.externalId,
        },
      });
      return success({ deleted: true, id });
    }
  );
}
