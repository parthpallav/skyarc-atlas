import type { FastifyInstance } from "fastify";
import {
  OrganizationStatus,
  OrganizationType,
  UserRole,
  parseOrganizationCommercial,
  resolveMarginPercent,
  isVendorUser,
  sanitizeOrgCommercialViewForUser,
  sanitizeOrganizationCommercialForUser,
} from "@skyarc/shared";
import argon2 from "argon2";
import {
  createOrganizationBodySchema,
  paginationQuerySchema,
  updateOrganizationCommercialBodySchema,
  updateVendorOrganizationCommercialBodySchema,
  updateOrganizationStatusBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { loadPlatformConfig } from "../../lib/commercial-config.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { canManageOrganizations, isReadOnly } from "../../lib/rbac.js";
import { success, listMeta } from "../../lib/response.js";

function serializeOrganization(org: {
  id: string;
  name: string;
  type: string;
  status: string;
  commercialJson?: unknown;
  createdAt: Date;
  updatedAt: Date;
  _count?: { members: number; locations: number };
}) {
  const commercial = parseOrganizationCommercial(org.commercialJson);
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    status: org.status,
    commercial,
    memberCount: org._count?.members ?? 0,
    locationCount: org._count?.locations ?? 0,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

async function commercialView(org: {
  commercialJson: unknown;
  type: string;
}) {
  const platform = await loadPlatformConfig();
  const commercial = parseOrganizationCommercial(org.commercialJson);
  const effectiveMarginPercent = resolveMarginPercent(commercial, platform);
  return {
    ...commercial,
    currency: commercial.currency ?? platform.currency,
    effectiveMarginPercent,
    platformDefaultMarginPercent: platform.defaultSkyarcMarginPercent,
    defaultMarginPercent: commercial.defaultMarginPercent ?? null,
    defaultRateAmount: commercial.defaultRateAmount ?? null,
    ratePeriod: commercial.ratePeriod ?? null,
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

    return success({
      ...serializeOrganization(org),
      commercialView: sanitizeOrgCommercialViewForUser(
        request.user,
        (await commercialView(org)) as Record<string, unknown>
      ),
    });
  });

  fastify.get(
    "/organizations/me/commercial",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!request.user.organizationId) throw notFound("No organization assigned");
      const org = await prisma.organization.findUnique({
        where: { id: request.user.organizationId },
      });
      if (!org) throw notFound("Organization not found");
      return success(
        sanitizeOrgCommercialViewForUser(
          request.user,
          (await commercialView(org)) as Record<string, unknown>
        )
      );
    }
  );

  fastify.patch(
    "/organizations/me/commercial",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!request.user.organizationId) throw notFound("No organization assigned");
      if (!isVendorUser(request.user) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const body = updateVendorOrganizationCommercialBodySchema.parse(request.body);
      const existing = await prisma.organization.findUnique({
        where: { id: request.user.organizationId },
      });
      if (!existing) throw notFound("Organization not found");

      const current = parseOrganizationCommercial(existing.commercialJson);
      const merged = {
        ...current,
        ...body,
      };

      const org = await prisma.organization.update({
        where: { id: existing.id },
        data: { commercialJson: merged },
        include: { _count: { select: { members: true, locations: true } } },
      });

      return success({
        ...serializeOrganization(org),
        commercial: sanitizeOrganizationCommercialForUser(
          request.user,
          parseOrganizationCommercial(org.commercialJson) as Record<string, unknown>
        ),
        commercialView: sanitizeOrgCommercialViewForUser(
          request.user,
          (await commercialView(org)) as Record<string, unknown>
        ),
      });
    }
  );

  fastify.get("/organizations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageOrganizations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true, locations: true } },
        members: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });
    if (!org) throw notFound("Organization not found");
    return success({
      ...serializeOrganization(org),
      members: org.members.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      })),
      commercialView: await commercialView(org),
    });
  });

  fastify.patch(
    "/organizations/:id/commercial",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canManageOrganizations(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const body = updateOrganizationCommercialBodySchema.parse(request.body);
      const existing = await prisma.organization.findUnique({ where: { id } });
      if (!existing) throw notFound("Organization not found");

      const current = parseOrganizationCommercial(existing.commercialJson);
      const merged = { ...current, ...body };

      const org = await prisma.organization.update({
        where: { id },
        data: { commercialJson: merged },
        include: { _count: { select: { members: true, locations: true } } },
      });

      return success({
        ...serializeOrganization(org),
        commercialView: await commercialView(org),
      });
    }
  );

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

    const cleanSlug = body.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const userEmail = `${cleanSlug || "vendor"}@skyarcads.com`;
    const defaultPassword = "VendorPassword123!";

    let createdUser: { id: string; email: string; name: string; tempPassword?: string } | null = null;
    const existing = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!existing) {
      const passwordHash = await argon2.hash(defaultPassword);
      const newUser = await prisma.user.create({
        data: {
          email: userEmail,
          name: `${body.name} Admin`,
          passwordHash,
          role: UserRole.VENDOR,
          organizationId: org.id,
        },
      });
      createdUser = {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        tempPassword: defaultPassword,
      };
    }

    return success({
      ...serializeOrganization(org),
      createdUser,
    });
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

  fastify.post(
    "/organizations/:id/request-availability",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canManageOrganizations(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const org = await prisma.organization.findUnique({
        where: { id },
        include: { members: true },
      });
      if (!org) throw notFound("Organization not found");

      return success({
        organizationId: org.id,
        organizationName: org.name,
        requestedAt: new Date().toISOString(),
        recipientCount: org.members.length,
        status: "REQUEST_SENT",
        message: `Inventory availability update request queued for ${org.name}.`,
      });
    }
  );
}
