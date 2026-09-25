import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  createLocationBodySchema,
  nearbyQuerySchema,
  flightAvailabilityQuerySchema,
  paginationQuerySchema,
  updateLocationBodySchema,
  updateLocationCommercialBodySchema,
  bulkApplyLocationCommercialBodySchema,
  updateSkyarcLocationCommercialBodySchema,
  bulkLocationActionBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import {
  SurveyStatus,
  canViewClientPricing,
  isClientUser,
  publicSkyarcSiteCode,
  siteNameForAudience,
  parseLocationCommercial,
  parseOrganizationCommercial,
  parseSkyarcLocationCommercial,
  resolveEffectiveLocationCommercial,
  resolveEffectiveSkyarcLocationCommercial,
  sanitizeLocationCommercialViewForUser,
  sanitizeOrganizationCommercialForUser,
  summarizeLocationLiveInventory,
} from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success, listMeta, toIso } from "../../lib/response.js";
import type { AuthUser } from "../../lib/rbac.js";
import {
  canReadLocations,
  canWriteLocation,
  isReadOnly,
  canAccessLocation,
  isVendorUser,
  isInternalUser,
} from "../../lib/rbac.js";
import {
  buildLocationListWhere,
  locationOwnedByUser,
  organizationIdForNewLocation,
  requireOrganization,
} from "../../lib/org-scope.js";
import { loadPlatformConfig } from "../../lib/commercial-config.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { coverUrlsForLocations } from "../../lib/asset-url.js";
import {
  customerRateForInventory,
  loadEligibleInventory,
  parseInventorySpecs,
} from "../../lib/media-planning/run-optimization.js";
import {
  getCachedLocationResponse,
  invalidateLocationCaches,
  locationDetailCacheKey,
  locationListCacheKey,
  setCachedLocationResponse,
} from "../../lib/cache/location-cache.js";

function serializeLocation(
  user: AuthUser,
  location: {
    id: string;
    skyarcSiteCode?: string | null;
    vendorMediaCode?: string | null;
    name: string;
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    capturedAt: Date | null;
    address: string | null;
    road: string | null;
    roadType: string | null;
    junction: string | null;
    orientationDeg: number | null;
    mountingType: string | null;
    mountingNotes: string | null;
    surveyStatus: string;
    archivedAt: Date | null;
    organizationId: string | null;
    commercialJson?: unknown;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
    scores?: Array<{ overallScore: number; overallConfidence: number }>;
    screens?: Array<{ inventories?: Array<{ inventoryType: string }> }>;
  },
  coverImageUrl?: string | null,
  commercialView?: ReturnType<typeof resolveEffectiveLocationCommercial>,
  skyarcCommercialView?: ReturnType<typeof resolveEffectiveSkyarcLocationCommercial>
) {
  const owned = locationOwnedByUser(user, location.organizationId);
  const commercialRaw = parseLocationCommercial(location.commercialJson);
  const commercial = owned
    ? (sanitizeOrganizationCommercialForUser(
        user,
        commercialRaw as Record<string, unknown>
      ) as typeof commercialRaw)
    : undefined;
  const view = sanitizeLocationCommercialViewForUser(
    user,
    location.organizationId,
    commercialView as Record<string, unknown> | undefined
  ) as ReturnType<typeof resolveEffectiveLocationCommercial> | undefined;

  const isClient = isClientUser(user);
  const score = isClient ? null : (location.scores?.[0]?.overallScore ?? null);
  const vendorMediaCode = isClient ? null : (location.vendorMediaCode ?? null);
  const skyarcSiteCode = publicSkyarcSiteCode(location.skyarcSiteCode, location.id);
  const name = siteNameForAudience(
    { name: location.name, road: location.road, skyarcSiteCode, id: location.id },
    isClient
  );

  const inventoryTypes = [
    ...new Set(
      location.screens?.flatMap((s) => s.inventories?.map((i) => i.inventoryType) ?? []) ?? []
    ),
  ];

  return {
    id: location.id,
    skyarcSiteCode,
    vendorMediaCode,
    name,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyM: location.accuracyM,
    capturedAt: toIso(location.capturedAt),
    address: location.address,
    road: location.road,
    roadType: location.roadType,
    junction: location.junction,
    orientationDeg: location.orientationDeg,
    mountingType: location.mountingType,
    mountingNotes: location.mountingNotes,
    surveyStatus: location.surveyStatus,
    archivedAt: toIso(location.archivedAt),
    organizationId: location.organizationId,
    isOwned: owned,
    score,
    inventoryTypes,
    ...(commercial ? { commercial } : {}),
    ...(view ? { commercialView: view } : {}),
    ...(canViewClientPricing(user) && skyarcCommercialView
      ? { skyarcCommercialView }
      : {}),
    createdByUserId: location.createdByUserId,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
    ...(coverImageUrl ? { coverImageUrl } : {}),
  };
}

async function commercialViewForLocation(location: {
  commercialJson: unknown;
  organizationId: string | null;
}) {
  const platform = await loadPlatformConfig();
  const locationCommercial = parseLocationCommercial(location.commercialJson);
  let orgCommercial = {};
  if (location.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: location.organizationId },
      select: { commercialJson: true },
    });
    orgCommercial = parseOrganizationCommercial(org?.commercialJson);
  }
  return resolveEffectiveLocationCommercial(
    locationCommercial,
    orgCommercial,
    platform
  );
}

async function skyarcCommercialViewForLocation(location: { skyarcCommercialJson: unknown }) {
  const platform = await loadPlatformConfig();
  return resolveEffectiveSkyarcLocationCommercial(
    parseSkyarcLocationCommercial(location.skyarcCommercialJson),
    platform
  );
}

export async function locationRoutes(fastify: FastifyInstance, env: Env) {
  fastify.get("/locations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const query = paginationQuerySchema.parse(request.query);
    const includeLive = isInternalUser(request.user);
    const hasCustomFilters = Boolean(
      query.q || query.status || query.type || query.scope || query.from || query.to
    );
    const cacheKey = locationListCacheKey(
      request.user.role,
      request.user.id,
      query.page,
      query.limit
    );
    // Live occupancy must stay fresh for concurrent sales pitching.
    if (!hasCustomFilters && !includeLive) {
      const cached = getCachedLocationResponse<{ data: unknown; meta: unknown }>(cacheKey);
      if (cached) return cached;
    }

    const skip = (query.page - 1) * query.limit;
    const baseWhere = buildLocationListWhere(request.user, query.scope);
    const filters: Record<string, unknown>[] = [];

    if (query.q) {
      filters.push({
        OR: [
          { name: { contains: query.q, mode: "insensitive" as const } },
          { road: { contains: query.q, mode: "insensitive" as const } },
          { address: { contains: query.q, mode: "insensitive" as const } },
          { junction: { contains: query.q, mode: "insensitive" as const } },
        ],
      });
    }

    if (query.status && query.status !== "ALL") {
      filters.push({ surveyStatus: query.status });
    }

    if (query.type && query.type !== "ALL") {
      filters.push({
        screens: {
          some: {
            inventories: {
              some: {
                inventoryType: { equals: query.type, mode: "insensitive" as const },
              },
            },
          },
        },
      });
    }

    const where = filters.length > 0 ? { ...baseWhere, AND: filters } : baseWhere;

    const locations = await prisma.location.findMany({
      where,
      skip,
      take: query.limit,
      include: {
        scores: { orderBy: { computedAt: "desc" }, take: 1 },
        screens: {
          include: {
            inventories: {
              include: { availabilityWindows: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const total = await prisma.location.count({ where });
    const covers = await coverUrlsForLocations(
      env,
      locations.map((l) => l.id)
    );

    const flightFrom = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : (() => {
          const d = new Date();
          d.setUTCHours(0, 0, 0, 0);
          return d;
        })();
    const flightTo = query.to
      ? new Date(`${query.to}T23:59:59.999Z`)
      : (() => {
          const d = new Date(flightFrom);
          d.setUTCDate(d.getUTCDate() + 30);
          return d;
        })();

    const platform = await loadPlatformConfig();
    const orgIds = [
      ...new Set(locations.map((l) => l.organizationId).filter((id): id is string => !!id)),
    ];
    const orgRows = orgIds.length
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, commercialJson: true },
        })
      : [];
    const orgCommercialById = new Map(
      orgRows.map((org) => [org.id, parseOrganizationCommercial(org.commercialJson)])
    );

    const response = success(
      locations.map((l) => {
        const locationCommercial = parseLocationCommercial(l.commercialJson);
        const orgCommercial = l.organizationId
          ? (orgCommercialById.get(l.organizationId) ?? {})
          : {};
        const commercialView = resolveEffectiveLocationCommercial(
          locationCommercial,
          orgCommercial,
          platform
        );
        const skyarcCommercialView = canViewClientPricing(request.user)
          ? resolveEffectiveSkyarcLocationCommercial(
              parseSkyarcLocationCommercial(l.skyarcCommercialJson),
              platform
            )
          : undefined;
        const base = serializeLocation(
          request.user,
          l,
          covers.get(l.id),
          commercialView,
          skyarcCommercialView
        );
        if (!includeLive) return base;

        const inventories = l.screens.flatMap((s) =>
          (s.inventories ?? []).map((inv) => ({
            inventoryType: inv.inventoryType,
            slotCapacity: inv.slotCapacity,
            status: inv.status,
            availabilityWindows: inv.availabilityWindows,
          }))
        );
        const liveInventory = summarizeLocationLiveInventory({
          inventories,
          startDate: flightFrom,
          endDate: flightTo,
        });
        return {
          ...base,
          liveInventory,
          flight: {
            from: flightFrom.toISOString().slice(0, 10),
            to: flightTo.toISOString().slice(0, 10),
          },
        };
      }),
      listMeta(query.page, query.limit, total)
    );
    if (!hasCustomFilters && !includeLive) {
      setCachedLocationResponse(cacheKey, response);
    }
    return response;
  });

  fastify.post("/locations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (isReadOnly(request.user)) throw forbidden();
    const body = createLocationBodySchema.parse(request.body);
    const id = body.id ?? randomUUID();

    const effectiveOrgId =
      request.user.role === "SUPERADMIN" || request.user.role === "ADMIN"
        ? body.organizationId || organizationIdForNewLocation(request.user)
        : organizationIdForNewLocation(request.user);

    let generatedSkyarcCode = body.skyarcSiteCode;
    if (!generatedSkyarcCode) {
      const count = await prisma.location.count();
      generatedSkyarcCode = `SKY-RAJ-${String(count + 1).padStart(3, "0")}`;
    }

    const location = await prisma.location.upsert({
      where: { id },
      create: {
        id,
        skyarcSiteCode: generatedSkyarcCode,
        vendorMediaCode: body.vendorMediaCode,
        name: body.name,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracyM: body.accuracyM,
        capturedAt: body.capturedAt ? new Date(body.capturedAt) : new Date(),
        address: body.address,
        road: body.road,
        roadType: body.roadType,
        junction: body.junction,
        orientationDeg: body.orientationDeg,
        mountingType: body.mountingType,
        mountingNotes: body.mountingNotes,
        surveyStatus: SurveyStatus.DRAFT,
        createdByUserId: request.user.id,
        organizationId: effectiveOrgId,
      },
      update: {
        skyarcSiteCode: body.skyarcSiteCode,
        vendorMediaCode: body.vendorMediaCode,
        name: body.name,
        latitude: body.latitude,
        longitude: body.longitude,
        accuracyM: body.accuracyM,
        capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
        address: body.address,
        road: body.road,
        roadType: body.roadType,
        junction: body.junction,
        orientationDeg: body.orientationDeg,
        mountingType: body.mountingType,
        mountingNotes: body.mountingNotes,
        ...(request.user.role === "SUPERADMIN" && body.organizationId
          ? { organizationId: body.organizationId }
          : {}),
      },
    });

    invalidateLocationCaches(id);
    return success(serializeLocation(request.user, location));
  });

  fastify.get("/locations/availability", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const query = flightAvailabilityQuerySchema.parse(request.query);
    const startDate = new Date(`${query.from}T00:00:00`);
    const endDate = new Date(`${query.to}T23:59:59`);
    if (!(startDate.getTime() <= endDate.getTime())) {
      return success({
        from: query.from,
        to: query.to,
        durationDays: 0,
        availableSites: 0,
        availableFaces: 0,
        bookedFaces: 0,
        sites: [],
      });
    }

    const [eligible, totalFaces] = await Promise.all([
      loadEligibleInventory(prisma, { startDate, endDate }),
      prisma.inventory.count({ where: { status: "AVAILABLE" } }),
    ]);

    const forCustomer = isClientUser(request.user);
    const uniqueLocationIds = new Set(eligible.map((inv) => inv.screen.locationId));
    const seenLocations = new Set<string>();
    const sites = [];
    for (const inv of eligible) {
      const location = inv.screen.location;
      if (seenLocations.has(inv.screen.locationId)) continue;
      seenLocations.add(inv.screen.locationId);
      const specs = parseInventorySpecs(inv.staticSpecsJson);
      const skyarcSiteCode = publicSkyarcSiteCode(
        (location as { skyarcSiteCode?: string | null }).skyarcSiteCode,
        inv.screen.locationId
      );
      sites.push({
        inventoryId: inv.id,
        locationId: inv.screen.locationId,
        skyarcSiteCode,
        displayName: siteNameForAudience(
          {
            name: location.name,
            road: location.road,
            skyarcSiteCode,
            id: inv.screen.locationId,
          },
          forCustomer
        ),
        road: location.road,
        inventoryType: inv.inventoryType ?? null,
        lighting: specs.lighting,
        widthFt: specs.widthFt,
        heightFt: specs.heightFt,
        clientRate: canViewClientPricing(request.user) ? customerRateForInventory(inv) : null,
      });
      if (sites.length >= 24) break;
    }

    const durationDays =
      Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;

    return success({
      from: query.from,
      to: query.to,
      durationDays,
      availableSites: uniqueLocationIds.size,
      availableFaces: eligible.length,
      bookedFaces: Math.max(0, totalFaces - eligible.length),
      sites,
    });
  });

  fastify.get("/locations/nearby", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const query = nearbyQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        distance_m: number;
      }>
    >`
      SELECT id, name, latitude, longitude,
        ST_Distance(
          geom,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography
        ) AS distance_m
      FROM "Location"
      WHERE "archivedAt" IS NULL
        AND geom IS NOT NULL
        AND ST_DWithin(
          geom,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography,
          ${query.radiusM}
        )
      ORDER BY distance_m ASC
      LIMIT ${query.limit} OFFSET ${skip}
    `;

    const total = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Location"
      WHERE "archivedAt" IS NULL
        AND geom IS NOT NULL
        AND ST_DWithin(
          geom,
          ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography,
          ${query.radiusM}
        )
    `;

    const ids = rows.map((r) => r.id);
    const locations = await prisma.location.findMany({ where: { id: { in: ids } } });
    const byId = new Map(locations.map((l) => [l.id, l]));
    const covers = await coverUrlsForLocations(env, ids);

    return success(
      rows.map((r) => ({
        ...serializeLocation(request.user, byId.get(r.id)!, covers.get(r.id)),
        distanceM: Number(r.distance_m),
      })),
      listMeta(query.page, query.limit, Number(total[0]?.count ?? 0))
    );
  });

  fastify.get("/locations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const cacheKey = locationDetailCacheKey(id, request.user.role);
    const cached = getCachedLocationResponse<{ data: unknown; meta: unknown }>(cacheKey);
    if (cached) return cached;

    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) throw notFound("Location not found");
    if (!canAccessLocation(request.user, location)) throw forbidden();
    const covers = await coverUrlsForLocations(env, [id]);
    const commercialView = await commercialViewForLocation(location);
    const skyarcCommercialView = await skyarcCommercialViewForLocation(location);
    const response = success(
      serializeLocation(
        request.user,
        location,
        covers.get(id),
        commercialView,
        skyarcCommercialView
      )
    );
    setCachedLocationResponse(cacheKey, response);
    return response;
  });

  fastify.patch("/locations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) throw notFound("Location not found");
    if (!canWriteLocation(request.user, existing) || isReadOnly(request.user)) {
      throw forbidden();
    }
    const body = updateLocationBodySchema.parse(request.body);
    const location = await prisma.location.update({
      where: { id },
      data: {
        ...body,
        capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
        surveyStatus: body.surveyStatus,
      },
    });
    invalidateLocationCaches(id);
    return success(serializeLocation(request.user, location));
  });

  fastify.delete("/locations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing || existing.archivedAt) throw notFound("Location not found");
    if (!canWriteLocation(request.user, existing) || isReadOnly(request.user)) {
      throw forbidden();
    }

    await prisma.location.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    invalidateLocationCaches(id);
    return success({ deleted: true, id });
  });

  fastify.patch(
    "/locations/:id/commercial",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const existing = await prisma.location.findUnique({ where: { id } });
      if (!existing) throw notFound("Location not found");
      if (!canWriteLocation(request.user, existing) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const body = updateLocationCommercialBodySchema.parse(request.body);
      const current = parseLocationCommercial(existing.commercialJson);
      const merged = { ...current, ...body };

      const location = await prisma.location.update({
        where: { id },
        data: { commercialJson: merged },
      });
      invalidateLocationCaches(id);
      const commercialView = await commercialViewForLocation(location);
      const skyarcCommercialView = await skyarcCommercialViewForLocation(location);
      return success(
        serializeLocation(
          request.user,
          location,
          undefined,
          commercialView,
          skyarcCommercialView
        )
      );
    }
  );

  fastify.patch(
    "/locations/:id/skyarc-commercial",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canViewClientPricing(request.user) || isReadOnly(request.user)) {
        throw forbidden();
      }
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const existing = await prisma.location.findUnique({ where: { id } });
      if (!existing) throw notFound("Location not found");
      if (!canAccessLocation(request.user, existing)) throw forbidden();

      const body = updateSkyarcLocationCommercialBodySchema.parse(request.body);
      const current = parseSkyarcLocationCommercial(existing.skyarcCommercialJson);
      const merged = { ...current, ...body };

      const location = await prisma.location.update({
        where: { id },
        data: { skyarcCommercialJson: merged },
      });
      invalidateLocationCaches(id);
      const commercialView = await commercialViewForLocation(location);
      const skyarcCommercialView = await skyarcCommercialViewForLocation(location);
      return success(
        serializeLocation(
          request.user,
          location,
          undefined,
          commercialView,
          skyarcCommercialView
        )
      );
    }
  );

  fastify.post(
    "/locations/commercial/bulk-apply",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!isVendorUser(request.user) || isReadOnly(request.user)) {
        throw forbidden();
      }
      const orgId = requireOrganization(request.user);
      const body = bulkApplyLocationCommercialBodySchema.parse(request.body);

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) throw notFound("Organization not found");

      const orgCommercial = parseOrganizationCommercial(org.commercialJson);
      const template: Record<string, unknown> = {};
      if (orgCommercial.defaultMarginPercent != null) {
        template.marginPercent = orgCommercial.defaultMarginPercent;
      }
      if (orgCommercial.defaultRateAmount != null) {
        template.defaultRateAmount = orgCommercial.defaultRateAmount;
      }
      if (orgCommercial.ratePeriod) template.ratePeriod = orgCommercial.ratePeriod;
      if (orgCommercial.currency) template.currency = orgCommercial.currency;
      if (orgCommercial.paymentTermsDays != null) {
        template.paymentTermsDays = orgCommercial.paymentTermsDays;
      }
      if (orgCommercial.notes) template.notes = orgCommercial.notes;

      const locations = await prisma.location.findMany({
        where: {
          id: { in: body.locationIds },
          organizationId: orgId,
          archivedAt: null,
        },
      });

      if (locations.length !== body.locationIds.length) {
        throw forbidden("One or more locations are not in your organization");
      }

      await prisma.$transaction(
        locations.map((location) =>
          prisma.location.update({
            where: { id: location.id },
            data: {
              commercialJson: {
                ...parseLocationCommercial(location.commercialJson),
                ...template,
              },
            },
          })
        )
      );

      for (const location of locations) {
        invalidateLocationCaches(location.id);
      }

      return success({ updated: locations.length });
    }
  );

  fastify.post(
    "/locations/bulk-actions",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (isReadOnly(request.user)) throw forbidden();
      if (!isInternalUser(request.user) && !isVendorUser(request.user)) {
        throw forbidden();
      }

      const body = bulkLocationActionBodySchema.parse(request.body);
      const where = isVendorUser(request.user)
        ? {
            id: { in: body.locationIds },
            organizationId: requireOrganization(request.user),
          }
        : { id: { in: body.locationIds } };

      const locations = await prisma.location.findMany({ where, select: { id: true } });
      if (locations.length === 0) {
        throw notFound("No matching locations");
      }
      const ids = locations.map((location) => location.id);

      if (body.action === "ARCHIVE") {
        await prisma.location.updateMany({
          where: { id: { in: ids } },
          data: { archivedAt: new Date() },
        });
      } else if (body.action === "UNARCHIVE") {
        await prisma.location.updateMany({
          where: { id: { in: ids } },
          data: { archivedAt: null },
        });
      } else {
        const status = body.action === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE";
        await prisma.inventory.updateMany({
          where: { screen: { locationId: { in: ids } } },
          data: { status },
        });
      }

      for (const id of ids) {
        invalidateLocationCaches(id);
      }

      return success({ updated: ids.length, action: body.action });
    }
  );
}
