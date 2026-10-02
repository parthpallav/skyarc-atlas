import type { FastifyInstance } from "fastify";
import {
  bookingQuoteBodySchema,
  issueQuoteBodySchema,
  acceptQuoteBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { canAccessLocation, isInternalUser } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations, canWriteCampaigns } from "../../lib/rbac.js";
import { quotePlayBasedBooking } from "../../lib/booking/quote.js";
import {
  acceptQuoteRevision,
  issueQuoteRevision,
} from "../../lib/booking/quote-revision.js";
import { fromMinorUnits } from "../../lib/booking/money.js";
import {
  assertSameTenant,
  requireTenantUnlessInternal,
  resolveTenantContext,
} from "../../lib/tenant-context.js";
import { customerSafePriceBreakdown } from "../../lib/booking/customer-safe-price.js";
import { isAdtechBookingEnabled } from "./serialize.js";
import { resolvePaymentAdapter } from "../../lib/booking/payment-adapter.js";
import { assertCanAccessCampaign, assertCanMutateCampaign } from "../../lib/campaign-access.js";

function serializeQuote(q: {
  id: string;
  campaignId: string | null;
  revisionNumber: number;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  expiresAt: Date;
  acceptedBookingId?: string | null;
  acceptedAt?: Date | null;
  chargesJson: unknown;
  rateVersionsJson: unknown;
  assumptionsJson: unknown;
  quantitiesJson?: unknown;
}) {
  return {
    id: q.id,
    campaignId: q.campaignId,
    revisionNumber: q.revisionNumber,
    status: q.status,
    currency: q.currency,
    subtotalMinor: q.subtotalMinor,
    taxMinor: q.taxMinor,
    totalMinor: q.totalMinor,
    subtotal: fromMinorUnits(q.subtotalMinor, q.currency),
    tax: fromMinorUnits(q.taxMinor, q.currency),
    total: fromMinorUnits(q.totalMinor, q.currency),
    expiresAt: q.expiresAt.toISOString(),
    acceptedBookingId: q.acceptedBookingId ?? null,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    chargesJson: q.chargesJson,
    rateVersionsJson: q.rateVersionsJson,
    assumptionsJson: q.assumptionsJson,
    quantitiesJson: q.quantitiesJson,
  };
}

export async function registerQuoteHttp(fastify: FastifyInstance) {
  fastify.post("/booking/quote", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) throw validationError("AdTech booking engine is not enabled");
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
              select: { id: true, organizationId: true, createdByUserId: true, archivedAt: true },
            },
          },
        },
      },
    });
    if (!inventory) throw notFound("Inventory not found");
    if (!canAccessLocation(request.user, inventory.screen.location)) {
      throw forbidden("You do not have access to this inventory");
    }

    const quoteInput = isInternalUser(request.user)
      ? body
      : { ...body, baseRateAmount: undefined, ratePeriod: undefined, gstPercent: undefined };

    const result = await quotePlayBasedBooking(prisma, quoteInput);
    if ("error" in result) {
      if (result.error === "Inventory not found") throw notFound(result.error);
      if (result.error === "PRICING_UNAVAILABLE") throw validationError("PRICING_UNAVAILABLE");
      throw validationError(result.error);
    }
    return success({
      ...result,
      price: customerSafePriceBreakdown(result.price),
    });
  });

  fastify.post("/quotes", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) throw validationError("AdTech booking engine is not enabled");
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const tenant = resolveTenantContext(request.user);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const body = issueQuoteBodySchema.parse(request.body);

    await assertCanMutateCampaign(request.user, body.campaignId);

    for (const line of body.lines) {
      const inv = await prisma.inventory.findUnique({
        where: { id: line.inventoryId },
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
      if (!inv) throw notFound(`Inventory not found: ${line.inventoryId}`);
      if (!canAccessLocation(request.user, inv.screen.location)) {
        throw forbidden("You do not have access to one or more inventory rows");
      }
    }

    const result = await issueQuoteRevision(prisma, {
      campaignId: body.campaignId,
      mediaPlanId: body.mediaPlanId,
      tenantOrganizationId: tenantOrgId ?? tenant.tenantId,
      actorUserId: request.user.id,
      inventoryQuotes: body.lines.map((line) => ({
        ...line,
        baseRateAmount: undefined,
        ratePeriod: undefined,
        gstPercent: undefined,
      })),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    if ("error" in result) {
      const err = result.error ?? "Quote issue failed";
      if (err === "PRICING_UNAVAILABLE") throw validationError("PRICING_UNAVAILABLE");
      throw validationError(err);
    }
    return success(serializeQuote(result.quote));
  });

  fastify.get("/quotes/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const q = await prisma.quoteRevision.findUnique({ where: { id } });
    if (!q) throw notFound("Quote not found");
    assertSameTenant(request.user, q.tenantOrganizationId);
    return success(serializeQuote(q));
  });

  fastify.post("/quotes/:id/accept", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) throw validationError("AdTech booking engine is not enabled");
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const tenant = resolveTenantContext(request.user);
    const tenantOrgId = requireTenantUnlessInternal(request.user);
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = acceptQuoteBodySchema.parse(request.body ?? {});

    const existing = await prisma.quoteRevision.findUnique({ where: { id } });
    if (!existing) throw notFound("Quote not found");
    assertSameTenant(request.user, existing.tenantOrganizationId);

    const result = await acceptQuoteRevision(prisma, {
      quoteId: id,
      actorUserId: request.user.id,
      tenantOrganizationId: tenantOrgId ?? tenant.tenantId,
      idempotencyKey: body.idempotencyKey,
      mode: body.mode,
      requireVendorApproval: body.requireVendorApproval,
      allowPartial: body.allowPartial,
    });
    if ("error" in result && result.error) {
      const details: Array<{ path?: string; message: string }> = [];
      if ("previousTotalMinor" in result && result.previousTotalMinor != null) {
        details.push({ path: "previousTotalMinor", message: String(result.previousTotalMinor) });
      }
      if ("recomputedTotalMinor" in result && result.recomputedTotalMinor != null) {
        details.push({ path: "recomputedTotalMinor", message: String(result.recomputedTotalMinor) });
      }
      if ("bookingId" in result && result.bookingId) {
        details.push({ path: "bookingId", message: String(result.bookingId) });
      }
      throw validationError(result.error, details);
    }
    return success(result);
  });

  fastify.get("/campaigns/:campaignId/quotes", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
    await assertCanAccessCampaign(request.user, campaignId);
    const quotes = await prisma.quoteRevision.findMany({
      where: { campaignId },
      orderBy: [{ revisionNumber: "desc" }],
      take: 50,
    });
    return success({ quotes: quotes.map(serializeQuote) });
  });

  /** Payment intent for a booking — returns UNAVAILABLE until provider is live. */
  fastify.post("/bookings/:id/payment-intent", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const booking = await prisma.booking.findUnique({
      where: { id },
      select: {
        id: true,
        tenantOrganizationId: true,
        paymentStatus: true,
        acceptedQuoteRevision: {
          select: { totalMinor: true, currency: true },
        },
      },
    });
    if (!booking) throw notFound("Booking not found");
    assertSameTenant(request.user, booking.tenantOrganizationId);

    const adapter = resolvePaymentAdapter();
    const amountMinor = booking.acceptedQuoteRevision?.totalMinor ?? 0;
    const currency = booking.acceptedQuoteRevision?.currency ?? "INR";
    if (!(amountMinor > 0)) {
      throw validationError("Booking has no accepted quote amount for payment");
    }
    const intent = await adapter.createIntent({
      bookingId: id,
      amountMinor,
      currency,
      idempotencyKey: `pay:${id}`,
    });
    if (intent.status === "UNAVAILABLE") {
      await prisma.booking.update({
        where: { id },
        data: { paymentStatus: "UNAVAILABLE", updatedAt: new Date() },
      });
    }
    return success(intent);
  });
}
