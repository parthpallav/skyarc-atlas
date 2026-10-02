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
import { resolveTenantContext } from "../../lib/tenant-context.js";
import { isAdtechBookingEnabled } from "./serialize.js";

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
    return success(result);
  });

  fastify.post("/quotes", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) throw validationError("AdTech booking engine is not enabled");
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const tenant = resolveTenantContext(request.user);
    const body = issueQuoteBodySchema.parse(request.body);

    const campaign = await prisma.campaign.findUnique({
      where: { id: body.campaignId },
      select: { id: true },
    });
    if (!campaign) throw notFound("Campaign not found");

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
      tenantOrganizationId: tenant.tenantId ?? request.user.organizationId ?? null,
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
    if (
      !isInternalUser(request.user) &&
      q.tenantOrganizationId &&
      q.tenantOrganizationId !== request.user.organizationId
    ) {
      throw forbidden();
    }
    return success(serializeQuote(q));
  });

  fastify.post("/quotes/:id/accept", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) throw validationError("AdTech booking engine is not enabled");
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const tenant = resolveTenantContext(request.user);
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = acceptQuoteBodySchema.parse(request.body ?? {});

    const existing = await prisma.quoteRevision.findUnique({ where: { id } });
    if (!existing) throw notFound("Quote not found");
    if (
      !isInternalUser(request.user) &&
      existing.tenantOrganizationId &&
      existing.tenantOrganizationId !== request.user.organizationId
    ) {
      throw forbidden();
    }

    const result = await acceptQuoteRevision(prisma, {
      quoteId: id,
      actorUserId: request.user.id,
      tenantOrganizationId: tenant.tenantId ?? request.user.organizationId ?? null,
      idempotencyKey: body.idempotencyKey,
      mode: body.mode,
      requireVendorApproval: body.requireVendorApproval,
    });
    if ("error" in result && result.error) {
      const details: Array<{ path?: string; message: string }> = [];
      if ("previousTotalMinor" in result && result.previousTotalMinor != null) {
        details.push({ path: "previousTotalMinor", message: String(result.previousTotalMinor) });
      }
      if ("recomputedTotalMinor" in result && result.recomputedTotalMinor != null) {
        details.push({ path: "recomputedTotalMinor", message: String(result.recomputedTotalMinor) });
      }
      throw validationError(result.error, details);
    }
    return success(result);
  });
}
