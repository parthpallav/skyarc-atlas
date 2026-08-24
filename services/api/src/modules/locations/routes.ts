import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  createLocationBodySchema,
  nearbyQuerySchema,
  paginationQuerySchema,
  updateLocationBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { SurveyStatus } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success, listMeta, toIso } from "../../lib/response.js";
import {
  canReadLocations,
  canWriteLocation,
  isReadOnly,
} from "../../lib/rbac.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { coverUrlsForLocations } from "../../lib/asset-url.js";
import {
  getCachedLocationResponse,
  invalidateLocationCaches,
  locationDetailCacheKey,
  locationListCacheKey,
  setCachedLocationResponse,
} from "../../lib/cache/location-cache.js";

function serializeLocation(
  location: {
  id: string;
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
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
},
  coverImageUrl?: string | null
) {
  return {
    id: location.id,
    name: location.name,
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
    createdByUserId: location.createdByUserId,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
    ...(coverImageUrl ? { coverImageUrl } : {}),
  };
}

export async function locationRoutes(fastify: FastifyInstance, env: Env) {
  fastify.get("/locations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const query = paginationQuerySchema.parse(request.query);
    const cacheKey = locationListCacheKey(
      request.user.role,
      request.user.id,
      query.page,
      query.limit
    );
    const cached = getCachedLocationResponse<{ data: unknown; meta: unknown }>(cacheKey);
    if (cached) return cached;

    const skip = (query.page - 1) * query.limit;
    const where =
      request.user.role === "FIELD_OPERATOR"
        ? { createdByUserId: request.user.id, archivedAt: null }
        : { archivedAt: null };

    const locations = await prisma.location.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { createdAt: "desc" },
    });
    const total = await prisma.location.count({ where });
    const covers = await coverUrlsForLocations(
      env,
      locations.map((l) => l.id)
    );

    const response = success(
      locations.map((l) => serializeLocation(l, covers.get(l.id))),
      listMeta(query.page, query.limit, total)
    );
    setCachedLocationResponse(cacheKey, response);
    return response;
  });

  fastify.post("/locations", { preHandler: [fastify.authenticate] }, async (request) => {
    if (isReadOnly(request.user)) throw forbidden();
    const body = createLocationBodySchema.parse(request.body);
    const id = body.id ?? randomUUID();

    const location = await prisma.location.upsert({
      where: { id },
      create: {
        id,
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
      },
      update: {
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
      },
    });

    invalidateLocationCaches(id);
    return success(serializeLocation(location));
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
        ...serializeLocation(byId.get(r.id)!, covers.get(r.id)),
        distanceM: Number(r.distance_m),
      })),
      listMeta(query.page, query.limit, Number(total[0]?.count ?? 0))
    );
  });

  fastify.get("/locations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const cacheKey = locationDetailCacheKey(id);
    const cached = getCachedLocationResponse<{ data: unknown; meta: unknown }>(cacheKey);
    if (cached) return cached;

    const location = await prisma.location.findUnique({ where: { id } });
    if (!location) throw notFound("Location not found");
    const covers = await coverUrlsForLocations(env, [id]);
    const response = success(serializeLocation(location, covers.get(id)));
    setCachedLocationResponse(cacheKey, response);
    return response;
  });

  fastify.patch("/locations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) throw notFound("Location not found");
    if (!canWriteLocation(request.user, existing.createdByUserId) || isReadOnly(request.user)) {
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
    return success(serializeLocation(location));
  });

  fastify.delete("/locations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing || existing.archivedAt) throw notFound("Location not found");
    if (!canWriteLocation(request.user, existing.createdByUserId) || isReadOnly(request.user)) {
      throw forbidden();
    }

    await prisma.location.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    invalidateLocationCaches(id);
    return success({ deleted: true, id });
  });
}
