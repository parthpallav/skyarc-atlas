import type { FastifyInstance } from "fastify";
import {
  bookingReserveBodySchema,
  bookingVendorRespondBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { canAccessLocation, isInternalUser, isVendorUser } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations, canWriteCampaigns } from "../../lib/rbac.js";
import {
  applyVendorItemDecisions,
  expireStaleHolds,
} from "../../lib/booking/reserve.js";
import {
  holdInventoryForCampaign,
  releaseInventoryForCampaign,
} from "../../lib/media-planning/run-optimization.js";
import { resolveTenantContext } from "../../lib/tenant-context.js";
import {
  bookingDetailInclude,
  bookingTenantWhere,
  isAdtechBookingEnabled,
  serializeBooking,
} from "./serialize.js";

export async function registerBookingHttp(fastify: FastifyInstance) {
  fastify.get("/bookings", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    await expireStaleHolds(prisma);

    const query = request.query as {
      campaignId?: string;
      status?: string;
      upcoming?: string;
    };
    const now = new Date();
    const where = {
      ...bookingTenantWhere(request.user),
      ...(query.campaignId ? { campaignId: uuidSchema.parse(query.campaignId) } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.upcoming === "true"
        ? { endDate: { gte: now }, status: { not: "CANCELLED" as const } }
        : {}),
    };

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        items: true,
        campaign: { select: { id: true, name: true, lifecycleStatus: true } },
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
      take: 100,
    });

    const pendingApprovals = bookings.filter((b) =>
      b.items.some((i) => i.status === "PENDING_VENDOR_APPROVAL")
    ).length;

    return success({
      bookings: bookings.map(serializeBooking),
      summary: {
        total: bookings.length,
        pendingApprovals,
        needsAttention: pendingApprovals,
      },
    });
  });

  fastify.get("/bookings/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    await expireStaleHolds(prisma);
    const id = uuidSchema.parse((request.params as { id: string }).id);

    const booking = await prisma.booking.findFirst({
      where: { id, ...bookingTenantWhere(request.user) },
      include: bookingDetailInclude,
    });
    if (!booking) throw notFound("Booking not found");
    return success(serializeBooking(booking));
  });

  fastify.post("/bookings/reserve", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) throw validationError("AdTech booking engine is not enabled");
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const tenant = resolveTenantContext(request.user);
    const body = bookingReserveBodySchema.parse(request.body);

    if (body.idempotencyKey) {
      const existing = await prisma.booking.findUnique({
        where: { idempotencyKey: body.idempotencyKey },
        include: bookingDetailInclude,
      });
      if (existing) return success(serializeBooking(existing));
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: body.campaignId },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!campaign) throw notFound("Campaign not found");
    if (!campaign.startDate || !campaign.endDate) {
      throw validationError("Campaign flight dates are required before reserve");
    }

    for (const inventoryId of body.inventoryIds) {
      const inv = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: {
          screen: {
            select: {
              location: {
                select: { id: true, organizationId: true, createdByUserId: true, archivedAt: true },
              },
            },
          },
        },
      });
      if (!inv) throw notFound(`Inventory not found: ${inventoryId}`);
      if (!canAccessLocation(request.user, inv.screen.location)) {
        throw forbidden("You do not have access to one or more inventory rows");
      }
    }

    try {
      const result = await holdInventoryForCampaign(
        prisma,
        body.campaignId,
        body.inventoryIds,
        body.mode,
        {
          mediaPlanId: body.mediaPlanId,
          actorUserId: request.user.id,
          tenantOrganizationId: tenant.tenantId ?? request.user.organizationId ?? null,
          idempotencyKey: body.idempotencyKey,
          requireVendorApproval: body.requireVendorApproval,
          syncBooking: true,
        }
      );

      if (result.held.length === 0) {
        throw validationError("No inventory could be reserved — capacity unavailable");
      }

      const booking = result.bookingId
        ? await prisma.booking.findUnique({
            where: { id: result.bookingId },
            include: bookingDetailInclude,
          })
        : null;

      return success({
        held: result.held,
        skipped: result.skipped,
        booking: booking ? serializeBooking(booking) : null,
      });
    } catch (err) {
      throw validationError(err instanceof Error ? err.message : "Reserve failed");
    }
  });

  fastify.post("/bookings/:id/cancel", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = (request.body ?? {}) as { reason?: string };

    const booking = await prisma.booking.findFirst({
      where: { id, ...bookingTenantWhere(request.user) },
      include: { items: true },
    });
    if (!booking) throw notFound("Booking not found");
    if (booking.status === "CANCELLED") {
      return success(serializeBooking({ ...booking, transitions: [] }));
    }

    await releaseInventoryForCampaign(
      prisma,
      booking.campaignId,
      booking.items.map((i) => i.inventoryId),
      { actorUserId: request.user.id, reason: body.reason ?? "cancelled_by_user" }
    );

    const updated = await prisma.booking.findUnique({
      where: { id },
      include: bookingDetailInclude,
    });
    if (!updated) throw notFound("Booking not found");
    return success(serializeBooking(updated));
  });

  fastify.post("/bookings/:id/respond", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isVendorUser(request.user) && !isInternalUser(request.user)) throw forbidden();
    const orgId = request.user.organizationId;
    if (!orgId && !isInternalUser(request.user)) throw forbidden("Vendor organization required");

    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = bookingVendorRespondBodySchema.parse(request.body);

    const booking = await prisma.booking.findFirst({
      where: { id, ...bookingTenantWhere(request.user) },
      select: { id: true },
    });
    if (!booking) throw notFound("Booking not found");

    const vendorOrgId = isInternalUser(request.user)
      ? body.vendorOrganizationId ?? orgId
      : orgId;
    if (!vendorOrgId) throw validationError("vendorOrganizationId required for internal actors");

    const updated = await applyVendorItemDecisions(prisma, {
      bookingId: id,
      vendorOrganizationId: vendorOrgId,
      inventoryIds: body.inventoryIds,
      action: body.action,
      actorUserId: request.user.id,
    });
    if (!updated) throw notFound("Booking not found");
    return success(serializeBooking(updated));
  });
}
