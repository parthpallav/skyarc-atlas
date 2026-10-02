import type { FastifyInstance } from "fastify";
import {
  bookingQuoteBodySchema,
  bookingReserveBodySchema,
  bookingVendorRespondBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { canAccessLocation, isInternalUser, isVendorUser } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations, canWriteCampaigns } from "../../lib/rbac.js";
import { quotePlayBasedBooking } from "../../lib/booking/quote.js";
import {
  applyVendorItemDecisions,
  expireStaleHolds,
} from "../../lib/booking/reserve.js";
import { holdInventoryForCampaign, releaseInventoryForCampaign } from "../../lib/media-planning/run-optimization.js";
import { resolveTenantContext } from "../../lib/tenant-context.js";

/** Feature gate — set ADTECH_BOOKING=true to expose booking APIs in prod. */
export function isAdtechBookingEnabled(): boolean {
  const flag = process.env.ADTECH_BOOKING;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function serializeBooking(booking: {
  id: string;
  tenantOrganizationId: string | null;
  campaignId: string;
  mediaPlanId: string | null;
  status: string;
  paymentStatus: string;
  executionStatus: string;
  startDate: Date;
  endDate: Date;
  expiresAt: Date | null;
  idempotencyKey: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: Array<{
    id: string;
    inventoryId: string;
    availabilityWindowId: string | null;
    vendorOrganizationId: string | null;
    status: string;
    slotsConsumed: number;
    mediaPlanItemId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  transitions?: Array<{
    id: string;
    bookingItemId: string | null;
    fromStatus: string;
    toStatus: string;
    actorUserId: string | null;
    reason: string | null;
    createdAt: Date;
  }>;
  campaign?: { id: string; name: string; lifecycleStatus: string } | null;
}) {
  return {
    id: booking.id,
    tenantOrganizationId: booking.tenantOrganizationId,
    campaignId: booking.campaignId,
    mediaPlanId: booking.mediaPlanId,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    executionStatus: booking.executionStatus,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate.toISOString(),
    expiresAt: booking.expiresAt?.toISOString() ?? null,
    idempotencyKey: booking.idempotencyKey,
    createdByUserId: booking.createdByUserId,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    campaign: booking.campaign
      ? {
          id: booking.campaign.id,
          name: booking.campaign.name,
          lifecycleStatus: booking.campaign.lifecycleStatus,
        }
      : undefined,
    items: (booking.items ?? []).map((item) => ({
      id: item.id,
      inventoryId: item.inventoryId,
      availabilityWindowId: item.availabilityWindowId,
      vendorOrganizationId: item.vendorOrganizationId,
      status: item.status,
      slotsConsumed: item.slotsConsumed,
      mediaPlanItemId: item.mediaPlanItemId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    transitions: (booking.transitions ?? []).map((t) => ({
      id: t.id,
      bookingItemId: t.bookingItemId,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      actorUserId: t.actorUserId,
      reason: t.reason,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

function bookingTenantWhere(user: { organizationId?: string | null; role: string }) {
  if (isInternalUser(user as never)) return {};
  if (isVendorUser(user as never) && user.organizationId) {
    return {
      OR: [
        { tenantOrganizationId: user.organizationId },
        { items: { some: { vendorOrganizationId: user.organizationId } } },
      ],
    };
  }
  if (user.organizationId) {
    return { tenantOrganizationId: user.organizationId };
  }
  return { id: "__none__" };
}

export async function bookingRoutes(fastify: FastifyInstance) {
  /**
   * Read-only play-based quote: feasibility + price breakdown.
   * Does not reserve inventory. Safe to call alongside legacy media-plan flows.
   */
  fastify.post("/booking/quote", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) {
      throw validationError("AdTech booking engine is not enabled");
    }
    if (!canReadLocations(request.user)) throw forbidden();
    resolveTenantContext(request.user);

    const body = bookingQuoteBodySchema.parse(request.body);

    const inventory = await prisma.inventory.findUnique({
      where: { id: body.inventoryId },
      select: {
        id: true,
        screen: {
          select: {
            location: {
              select: {
                id: true,
                organizationId: true,
                createdByUserId: true,
                archivedAt: true,
              },
            },
          },
        },
      },
    });
    if (!inventory) throw notFound("Inventory not found");
    if (!canAccessLocation(request.user, inventory.screen.location)) {
      throw forbidden("You do not have access to this inventory");
    }

    // Customer / vendor callers cannot override commercial rates on quotes.
    const quoteInput = isInternalUser(request.user)
      ? body
      : {
          ...body,
          baseRateAmount: undefined,
          ratePeriod: undefined,
          gstPercent: undefined,
        };

    const result = await quotePlayBasedBooking(prisma, quoteInput);
    if ("error" in result) {
      if (result.error === "Inventory not found") throw notFound(result.error);
      if (result.error === "PRICING_UNAVAILABLE") {
        throw validationError("PRICING_UNAVAILABLE");
      }
      throw validationError(result.error);
    }
    return success(result);
  });

  /** List bookings scoped to tenant / vendor inventory. */
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
    const conflicts = bookings.filter((b) =>
      b.items.some((i) => i.status === "REJECTED") && b.items.some((i) => i.status === "CONFIRMED" || i.status === "HELD")
    ).length;

    return success({
      bookings: bookings.map(serializeBooking),
      summary: {
        total: bookings.length,
        pendingApprovals,
        conflicts,
        upcomingStarts: bookings.filter((b) => b.startDate > now && b.status !== "CANCELLED").length,
        upcomingEndings: bookings.filter(
          (b) => b.endDate > now && b.endDate < new Date(now.getTime() + 7 * 86400000) && b.status === "CONFIRMED"
        ).length,
      },
    });
  });

  fastify.get("/bookings/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    await expireStaleHolds(prisma);
    const id = uuidSchema.parse((request.params as { id: string }).id);

    const booking = await prisma.booking.findFirst({
      where: { id, ...bookingTenantWhere(request.user) },
      include: {
        items: true,
        transitions: { orderBy: { createdAt: "asc" }, take: 200 },
        campaign: { select: { id: true, name: true, lifecycleStatus: true } },
      },
    });
    if (!booking) throw notFound("Booking not found");
    return success(serializeBooking(booking));
  });

  /**
   * Authoritative reserve: atomic capacity recheck + Booking ledger.
   * Idempotent when idempotencyKey is supplied.
   */
  fastify.post("/bookings/reserve", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) {
      throw validationError("AdTech booking engine is not enabled");
    }
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const tenant = resolveTenantContext(request.user);
    const body = bookingReserveBodySchema.parse(request.body);

    if (body.idempotencyKey) {
      const existing = await prisma.booking.findUnique({
        where: { idempotencyKey: body.idempotencyKey },
        include: {
          items: true,
          transitions: { orderBy: { createdAt: "asc" }, take: 200 },
          campaign: { select: { id: true, name: true, lifecycleStatus: true } },
        },
      });
      if (existing) return success(serializeBooking(existing));
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: body.campaignId },
      select: { id: true, startDate: true, endDate: true, createdByUserId: true },
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
            include: {
              items: true,
              transitions: { orderBy: { createdAt: "asc" }, take: 200 },
              campaign: { select: { id: true, name: true, lifecycleStatus: true } },
            },
          })
        : null;

      return success({
        held: result.held,
        skipped: result.skipped,
        booking: booking ? serializeBooking(booking) : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reserve failed";
      throw validationError(message);
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
      include: {
        items: true,
        transitions: { orderBy: { createdAt: "asc" }, take: 200 },
        campaign: { select: { id: true, name: true, lifecycleStatus: true } },
      },
    });
    if (!updated) throw notFound("Booking not found");
    return success(serializeBooking(updated));
  });

  /** Vendor partial approval / rejection on booking items. */
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
