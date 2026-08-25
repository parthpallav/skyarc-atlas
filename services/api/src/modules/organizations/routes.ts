import type { FastifyInstance } from "fastify";
import { OrganizationStatus, OrganizationType } from "@skyarc/shared";
import {
  createOrganizationBodySchema,
  paginationQuerySchema,
  updateOrganizationStatusBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { canManageOrganizations } from "../../lib/rbac.js";
import { success, listMeta } from "../../lib/response.js";

function serializeOrganization(org: {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { members: number; locations: number };
}) {
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    status: org.status,
    memberCount: org._count?.members ?? 0,
    locationCount: org._count?.locations ?? 0,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

export async function organizationRoutes(fastify: FastifyInstance) {
  fastify.get("/organizations/me", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!request.user.organizationId) {
      throw notFound("No organization assigned");
    }

    const org = await prisma.organization.findUnique({
      where: { id: request.user.organizationId },
      include: { _count: { select: { members: true, locations: true } } },
    });
    if (!org) throw notFound("Organization not found");

    return success(serializeOrganization(org));
  });

  fastify.get("/organizations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageOrganizations(request.user)) throw forbidden();

    const query = paginationQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;
    const where = { type: OrganizationType.VENDOR };

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { members: true, locations: true } } },
      }),
      prisma.organization.count({ where }),
    ]);

    return success(
      organizations.map(serializeOrganization),
      listMeta(query.page, query.limit, total)
    );
  });

  fastify.post("/organizations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageOrganizations(request.user)) throw forbidden();

    const body = createOrganizationBodySchema.parse(request.body);
    const org = await prisma.organization.create({
      data: {
        name: body.name,
        type: OrganizationType.VENDOR,
        status: OrganizationStatus.ACTIVE,
      },
      include: { _count: { select: { members: true, locations: true } } },
    });

    return success(serializeOrganization(org));
  });

  fastify.patch(
    "/organizations/:id/status",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canManageOrganizations(request.user)) throw forbidden();

      const id = uuidSchema.parse((request.params as { id: string }).id);
      const body = updateOrganizationStatusBodySchema.parse(request.body);

      const org = await prisma.organization.update({
        where: { id },
        data: { status: body.status },
        include: { _count: { select: { members: true, locations: true } } },
      });

      return success(serializeOrganization(org));
    }
  );
}
