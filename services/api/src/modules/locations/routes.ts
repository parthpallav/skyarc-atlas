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
  siteInterestBodySchema,
  locationPresenceBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import {
  SurveyStatus,
  canViewClientPricing,
  isClientUser,
  isDigitalInventoryType,
  effectiveSlotCapacity,
  publicSkyarcSiteCode,
  siteNameForAudience,
  locationBookingBadge,
  parseLocationCommercial,
  parseOrganizationCommercial,
  parseSkyarcLocationCommercial,
  resolveEffectiveLocationCommercial,
  resolveEffectiveSkyarcLocationCommercial,
  sanitizeLocationCommercialViewForUser,
  sanitizeOrganizationCommercialForUser,
  summarizeLocationLiveInventory,
  buildSkyarcSiteCode,
  normalizeCityName,
  getMarketCity,
  listMarketCities,
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
  releaseHoldsForHiddenLocations,
} from "../../lib/media-planning/run-optimization.js";
import { syncCampaignLifecycle } from "../../lib/media-planning/campaign-lifecycle.js";
import {
  getCachedLocationResponse,
  invalidateLocationCaches,
  locationDetailCacheKey,
  setCachedLocationResponse,
} from "../../lib/cache/location-cache.js";
import {
  countLocationViewersBatch,
  touchLocationPresence,
} from "../../lib/cache/presence-cache.js";

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
    city?: string | null;
    district?: string | null;
    state?: string | null;
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
    screens?: Array<{
      inventoryStatus?: string | null;
      inventories?: Array<{
        inventoryType: string;
        status?: string | null;
        slotCapacity?: number | null;
        staticSpecsJson?: unknown;
        availabilityWindows?: Array<{
          status: string;
          startDate?: Date | string | null;
          endDate?: Date | string | null;
          slotsConsumed?: number | null;
          expiresAt?: Date | string | null;
          notes?: string | null;
        }>;
      }>;
    }>;
    organization?: { name: string; type: string } | null;
  },
  coverImageUrl?: string | null,
  commercialView?: ReturnType<typeof resolveEffectiveLocationCommercial>,
  skyarcCommercialView?: ReturnType<typeof resolveEffectiveSkyarcLocationCommercial>,
  flightWindow?: { startDate: Date; endDate: Date }
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
  const isInternal = isInternalUser(user);
  const score = location.scores?.[0]?.overallScore ?? null;
  // Skyarc ID is always public; vendor IID + media owner for internal roles
  // (showcase flag strips these later for client screen-shares).
  const vendorMediaCode = isInternal ? (location.vendorMediaCode ?? null) : null;
  const skyarcSiteCode = publicSkyarcSiteCode(location.skyarcSiteCode, location.id);
  const mediaOwner = isInternal
    ? (location.organization?.name?.trim() || null)
    : null;
  const name = siteNameForAudience(
    {
      name: location.name,
      road: location.road,
      junction: location.junction,
      skyarcSiteCode: location.skyarcSiteCode,
      id: location.id,
    },
    isClient
  );

  const flatInventories =
    location.screens?.flatMap((screen) =>
      (screen.inventories ?? []).map((inventory) => ({
        ...inventory,
        screenStatus: screen.inventoryStatus,
      }))
    ) ?? [];

  const inventoryTypes = [...new Set(flatInventories.map((i) => i.inventoryType))];
  const primaryInv =
    flatInventories.find((i) => isDigitalInventoryType(i.inventoryType)) ??
    flatInventories[0] ??
    null;
  const primarySpecs = primaryInv
    ? parseInventorySpecs(primaryInv.staticSpecsJson)
    : { widthFt: null, heightFt: null, lighting: null };
  const primaryFace = primaryInv
    ? {
        inventoryId: "id" in primaryInv ? String((primaryInv as { id: string }).id) : null,
        inventoryType: primaryInv.inventoryType,
        widthFt: primarySpecs.widthFt,
        heightFt: primarySpecs.heightFt,
        sizeLabel:
          primarySpecs.widthFt && primarySpecs.heightFt
            ? `${primarySpecs.widthFt}×${primarySpecs.heightFt} ft`
            : null,
        slotCapacity: effectiveSlotCapacity(
          primaryInv.inventoryType,
          primaryInv.slotCapacity
        ),
        isDigital: isDigitalInventoryType(primaryInv.inventoryType),
      }
    : null;

  const bookingStatus = locationBookingBadge({
    startDate: flightWindow?.startDate,
    endDate: flightWindow?.endDate,
    inventories: flatInventories.map((inventory) => ({
      status: inventory.status,
      screenStatus: inventory.screenStatus,
      inventoryType: inventory.inventoryType,
      slotCapacity: inventory.slotCapacity,
      availabilityWindows: inventory.availabilityWindows,
    })),
  });

  return {
    id: location.id,
    skyarcSiteCode,
    vendorMediaCode,
    ...(mediaOwner ? { mediaOwner } : {}),
    name,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyM: location.accuracyM,
    capturedAt: toIso(location.capturedAt),
    address: location.address,
    road: location.road,
    roadType: location.roadType,
    junction: location.junction,
    city: location.city ?? null,
    district: location.district ?? null,
    state: location.state ?? null,
    orientationDeg: location.orientationDeg,
    mountingType: location.mountingType,
    mountingNotes: location.mountingNotes,
    surveyStatus: location.surveyStatus,
    bookingStatus,
    archivedAt: toIso(location.archivedAt),
    organizationId: isClient ? null : location.organizationId,
    isOwned: owned,
    score,
    inventoryTypes,
    ...(primaryFace ? { primaryFace } : {}),
    ...(commercial ? { commercial } : {}),
    ...(canViewClientPricing(user) && skyarcCommercialView
      ? { skyarcCommercialView }
      : {}),
    ...(view ? { commercialView: view } : {}),
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

function listMarketCitiesPayload() {
  return listMarketCities().map((c) => ({
    id: c.id,
    name: c.name,
    district: c.district,
    state: c.state,
    stateCode: c.stateCode,
    siteCodePrefix: c.siteCodePrefix,
    center: c.center,
    defaultZoom: c.defaultZoom,
    corridors: c.corridors.map((x) => x.name),
  }));
}

function splitCsvParam(value?: string): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function geoFilterClauses(query: {
  cities?: string;
  districts?: string;
  states?: string;
  corridors?: string;
}): Record<string, unknown>[] {
  const filters: Record<string, unknown>[] = [];
  const cities = splitCsvParam(query.cities);
  const districts = splitCsvParam(query.districts);
  const states = splitCsvParam(query.states);
  const corridors = splitCsvParam(query.corridors);

  if (cities.length > 0) {
    filters.push({
      OR: cities.map((c) => ({ city: { equals: c, mode: "insensitive" as const } })),
    });
  }
  if (districts.length > 0) {
    filters.push({
      OR: districts.map((d) => ({ district: { equals: d, mode: "insensitive" as const } })),
    });
  }
  if (states.length > 0) {
    filters.push({
      OR: states.map((s) => ({ state: { equals: s, mode: "insensitive" as const } })),
    });
  }
  if (corridors.length > 0) {
    filters.push({
      OR: corridors.flatMap((road) => [
        { road: { contains: road, mode: "insensitive" as const } },
        { address: { contains: road, mode: "insensitive" as const } },
        { junction: { contains: road, mode: "insensitive" as const } },
      ]),
    });
  }
  return filters;
}

export async function locationRoutes(fastify: FastifyInstance, env: Env) {
  fastify.get("/locations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const query = paginationQuerySchema.parse(request.query);
    const hasCustomFilters = Boolean(
      query.q ||
        query.status ||
        query.type ||
        query.scope ||
        query.from ||
        query.to ||
        query.cities ||
        query.districts ||
        query.states ||
        query.corridors ||
        (query.visibility && query.visibility !== "active")
    );
    // Live occupancy is always computed — never serve a stale list cache for pitching.
    void hasCustomFilters;

    const skip = (query.page - 1) * query.limit;
    const baseWhere = buildLocationListWhere(
      request.user,
      query.scope,
      query.visibility ?? "active"
    );
    const filters: Record<string, unknown>[] = [...geoFilterClauses(query)];

    if (query.q) {
      filters.push({
        OR: [
          { name: { contains: query.q, mode: "insensitive" as const } },
          { road: { contains: query.q, mode: "insensitive" as const } },
          { address: { contains: query.q, mode: "insensitive" as const } },
          { junction: { contains: query.q, mode: "insensitive" as const } },
          { city: { contains: query.q, mode: "insensitive" as const } },
          { skyarcSiteCode: { contains: query.q, mode: "insensitive" as const } },
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
    const flightWindow = { startDate: flightFrom, endDate: flightTo };

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

    return success(
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
          skyarcCommercialView,
          flightWindow
        );

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
      const cityName = normalizeCityName(body.city) ?? getMarketCity().name;
      const count = await prisma.location.count({
        where: { city: { equals: cityName, mode: "insensitive" } },
      });
      generatedSkyarcCode = buildSkyarcSiteCode(cityName, count + 1);
    }

    const city = normalizeCityName(body.city) ?? null;
    const market = city ? getMarketCity(city) : null;
    const district = body.district?.trim() || market?.district || null;
    const state = body.state?.trim() || market?.state || null;

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
        city,
        district,
        state,
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
        city: body.city !== undefined ? city : undefined,
        district: body.district !== undefined ? district : undefined,
        state: body.state !== undefined ? state : undefined,
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

  fastify.get("/locations/geo-facets", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const baseWhere = buildLocationListWhere(request.user, undefined);
    const [cityRows, districtRows, stateRows, roadRows] = await Promise.all([
      prisma.location.findMany({
        where: { ...baseWhere, city: { not: null } },
        select: { city: true },
        distinct: ["city"],
        orderBy: { city: "asc" },
        take: 200,
      }),
      prisma.location.findMany({
        where: { ...baseWhere, district: { not: null } },
        select: { district: true },
        distinct: ["district"],
        orderBy: { district: "asc" },
        take: 200,
      }),
      prisma.location.findMany({
        where: { ...baseWhere, state: { not: null } },
        select: { state: true },
        distinct: ["state"],
        orderBy: { state: "asc" },
        take: 100,
      }),
      prisma.location.findMany({
        where: { ...baseWhere, road: { not: null } },
        select: { road: true },
        distinct: ["road"],
        orderBy: { road: "asc" },
        take: 300,
      }),
    ]);

    return success({
      cities: cityRows.map((r) => r.city!).filter(Boolean),
      districts: districtRows.map((r) => r.district!).filter(Boolean),
      states: stateRows.map((r) => r.state!).filter(Boolean),
      corridors: roadRows.map((r) => r.road!).filter(Boolean),
      markets: listMarketCitiesPayload(),
    });
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

  /**
   * Live market signal for conversion UX:
   * - viewersNow: other authenticated users exploring the site (heartbeat TTL)
   * - inActivePlans: distinct DRAFT/PROPOSED media plans that already include a face here
   */
  fastify.post("/locations/site-interest", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const body = siteInterestBodySchema.parse(request.body);

    const accessible = await prisma.location.findMany({
      where: { id: { in: body.locationIds }, archivedAt: null },
      select: { id: true, organizationId: true, createdByUserId: true, archivedAt: true },
    });
    const allowedIds = accessible
      .filter((loc) => canAccessLocation(request.user, loc))
      .map((loc) => loc.id);

    const viewers = countLocationViewersBatch(allowedIds, request.user.id);

    const planRows =
      allowedIds.length === 0
        ? []
        : await prisma.mediaPlanItem.findMany({
            where: {
              mediaPlan: { status: { in: ["DRAFT", "PROPOSED"] } },
              inventory: { screen: { locationId: { in: allowedIds } } },
            },
            select: {
              mediaPlanId: true,
              inventory: { select: { screen: { select: { locationId: true } } } },
            },
          });

    const plansByLocation = new Map<string, Set<string>>();
    for (const row of planRows) {
      const locationId = row.inventory.screen.locationId;
      if (!plansByLocation.has(locationId)) plansByLocation.set(locationId, new Set());
      plansByLocation.get(locationId)!.add(row.mediaPlanId);
    }

    const byLocationId: Record<string, { viewersNow: number; inActivePlans: number }> = {};
    for (const id of body.locationIds) {
      if (!allowedIds.includes(id)) {
        byLocationId[id] = { viewersNow: 0, inActivePlans: 0 };
        continue;
      }
      byLocationId[id] = {
        viewersNow: viewers[id] ?? 0,
        inActivePlans: plansByLocation.get(id)?.size ?? 0,
      };
    }

    return success({
      byLocationId,
      computedAt: new Date().toISOString(),
    });
  });

  fastify.post("/locations/:id/presence", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    locationPresenceBodySchema.parse(request.body ?? {});
    const location = await prisma.location.findUnique({
      where: { id },
      select: { id: true, organizationId: true, createdByUserId: true, archivedAt: true },
    });
    if (!location) throw notFound("Location not found");
    if (!canAccessLocation(request.user, location)) throw forbidden();
    const { expiresIn } = touchLocationPresence(id, request.user.id);
    return success({ ok: true, expiresIn });
  });

  /**
   * Recent campaigns / media plans that included a face at this location —
   * social proof for the location detail Overview.
   */
  fastify.get(
    "/locations/:id/campaign-history",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const query = (request.query ?? {}) as { limit?: string };
      const limit = Math.min(12, Math.max(1, Number(query.limit) || 6));

      const location = await prisma.location.findUnique({
        where: { id },
        select: { id: true, organizationId: true, createdByUserId: true, archivedAt: true },
      });
      if (!location) throw notFound("Location not found");
      if (!canAccessLocation(request.user, location)) throw forbidden();

      const plans = await prisma.mediaPlan.findMany({
        where: {
          status: { in: ["APPROVED", "PROPOSED", "DRAFT"] },
          items: {
            some: {
              inventory: { screen: { locationId: id } },
            },
          },
          ...(isVendorUser(request.user)
            ? {
                OR: [
                  { campaign: { createdByUserId: request.user.id } },
                  {
                    status: "DRAFT" as const,
                    items: {
                      some: {
                        inventory: {
                          screen: {
                            location: {
                              organizationId: request.user.organizationId ?? "__none__",
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: limit * 3,
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              advertiser: { select: { id: true, name: true } },
            },
          },
        },
      });

      const seen = new Set<string>();
      const campaigns: Array<{
        campaignId: string;
        campaignName: string;
        advertiserName: string;
        planId: string;
        planName: string;
        planStatus: string;
        startDate: string | null;
        endDate: string | null;
        updatedAt: string;
      }> = [];

      for (const plan of plans) {
        if (seen.has(plan.campaignId)) continue;
        seen.add(plan.campaignId);
        campaigns.push({
          campaignId: plan.campaignId,
          campaignName: plan.campaign.name,
          advertiserName: plan.campaign.advertiser.name,
          planId: plan.id,
          planName: plan.name,
          planStatus: plan.status,
          startDate: plan.campaign.startDate?.toISOString() ?? null,
          endDate: plan.campaign.endDate?.toISOString() ?? null,
          updatedAt: plan.updatedAt.toISOString(),
        });
        if (campaigns.length >= limit) break;
      }

      return success({ campaigns, total: campaigns.length });
    }
  );

  fastify.get("/locations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const query = (request.query ?? {}) as { from?: string; to?: string };
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
          d.setUTCHours(23, 59, 59, 999);
          return d;
        })();
    const fromKey = flightFrom.toISOString().slice(0, 10);
    const toKey = flightTo.toISOString().slice(0, 10);
    const platform = await loadPlatformConfig();
    const showVendorDetails =
      !isInternalUser(request.user) || platform.showVendorDetailsOnLocationPage;
    const cacheKey = locationDetailCacheKey(
      id,
      request.user.role,
      fromKey,
      toKey,
      showVendorDetails
    );
    const cached = getCachedLocationResponse<{ data: unknown; meta: unknown }>(cacheKey);
    if (cached) return cached;

    const location = await prisma.location.findUnique({
      where: { id },
      include: {
        organization: { select: { name: true, type: true } },
        screens: {
          include: {
            inventories: {
              include: {
                availabilityWindows: {
                  where: { endDate: { gte: flightFrom } },
                  select: {
                    status: true,
                    startDate: true,
                    endDate: true,
                    slotsConsumed: true,
                    expiresAt: true,
                    notes: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!location) throw notFound("Location not found");
    if (!canAccessLocation(request.user, location)) throw forbidden();
    const covers = await coverUrlsForLocations(env, [id]);
    const commercialView = await commercialViewForLocation(location);
    const skyarcCommercialView = await skyarcCommercialViewForLocation(location);
    const inventories = location.screens.flatMap((s) =>
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
    const base = serializeLocation(
      request.user,
      location,
      covers.get(id),
      commercialView,
      skyarcCommercialView,
      { startDate: flightFrom, endDate: flightTo }
    );
    const scrubbed = showVendorDetails
      ? base
      : (() => {
          const {
            mediaOwner: _owner,
            commercialView: _cv,
            commercial: _c,
            ...rest
          } = base as typeof base & {
            mediaOwner?: string;
            commercialView?: unknown;
            commercial?: unknown;
          };
          return {
            ...rest,
            vendorMediaCode: null,
            organizationId: base.isOwned ? base.organizationId : null,
          };
        })();
    const response = success({
      ...scrubbed,
      showVendorDetails,
      liveInventory,
      flight: {
        from: fromKey,
        to: toKey,
      },
    });
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
    const city =
      body.city !== undefined ? normalizeCityName(body.city) : undefined;
    const market = city ? getMarketCity(city) : null;
    const location = await prisma.location.update({
      where: { id },
      data: {
        ...body,
        city,
        district:
          body.district !== undefined
            ? body.district?.trim() || market?.district || null
            : undefined,
        state:
          body.state !== undefined
            ? body.state?.trim() || market?.state || null
            : undefined,
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
        // Free soft-holds; keep BOOKED flights for live/approved campaigns
        const released = await releaseHoldsForHiddenLocations(prisma, ids);
        const emptyDrafts = await prisma.mediaPlan.findMany({
          where: { status: "DRAFT", items: { none: {} } },
          select: { id: true, campaignId: true },
        });
        for (const plan of emptyDrafts) {
          await prisma.mediaPlan.update({
            where: { id: plan.id },
            data: { status: "REJECTED" },
          });
        }
        const campaignIds = [
          ...new Set([...released.campaignIds, ...emptyDrafts.map((p) => p.campaignId)]),
        ];
        for (const campaignId of campaignIds) {
          await syncCampaignLifecycle(prisma, campaignId);
        }
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
