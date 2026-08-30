import type { FastifyInstance } from "fastify";
import { platformConfigBodySchema } from "@skyarc/validation";
import { DEFAULT_PLATFORM_CONFIG, parsePlatformConfig } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { loadPlatformConfig } from "../../lib/commercial-config.js";
import { canManageOrganizations } from "../../lib/rbac.js";
import { forbidden } from "../../lib/errors.js";
import { success } from "../../lib/response.js";

export async function platformRoutes(fastify: FastifyInstance) {
  fastify.get("/platform/config", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageOrganizations(request.user)) throw forbidden();
    const config = await loadPlatformConfig();
    return success(config);
  });

  fastify.patch("/platform/config", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageOrganizations(request.user)) throw forbidden();
    const body = platformConfigBodySchema.parse(request.body);
    const current = await loadPlatformConfig();
    const next = {
      defaultSkyarcMarginPercent:
        body.defaultSkyarcMarginPercent ?? current.defaultSkyarcMarginPercent,
      currency: body.currency ?? current.currency,
    };
    const row = await prisma.platformConfig.upsert({
      where: { id: "default" },
      create: { id: "default", data: next },
      update: { data: next },
    });
    return success(parsePlatformConfig(row.data ?? DEFAULT_PLATFORM_CONFIG));
  });
}
