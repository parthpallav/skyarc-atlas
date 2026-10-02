import type { Prisma, PrismaClient } from "@prisma/client";
import { INVENTORY_HOLD_TTL_MINUTES } from "@skyarc/shared";
import { quotePlayBasedBooking, type BookingQuoteInput } from "./quote.js";
import { fromMinorUnits, toMinorUnits, totalsMatch } from "./money.js";
import { customerSafePriceBreakdown } from "./customer-safe-price.js";
import {
  holdInventoryForCampaign,
  releaseInventoryForCampaign,
} from "../media-planning/run-optimization.js";

const DEFAULT_QUOTE_TTL_HOURS = 48;

export type IssueQuoteInput = {
  campaignId: string;
  mediaPlanId?: string | null;
  tenantOrganizationId?: string | null;
  actorUserId?: string | null;
  inventoryQuotes: BookingQuoteInput[];
  expiresAt?: Date;
};

export async function issueQuoteRevision(prisma: PrismaClient, input: IssueQuoteInput) {
  if (input.inventoryQuotes.length === 0) {
    return { error: "At least one inventory quote line is required" as const };
  }

  const lines: Array<Record<string, unknown>> = [];
  const rateVersions: Array<Record<string, unknown>> = [];
  const inventoryIds: string[] = [];
  let subtotalMinor = 0;
  let taxMinor = 0;
  let currency = "INR";

  for (const lineInput of input.inventoryQuotes) {
    const result = await quotePlayBasedBooking(prisma, lineInput);
    if ("error" in result) {
      return { error: result.error as string };
    }
    currency = result.price.currency || currency;
    const safePrice = customerSafePriceBreakdown(result.price);
    const lineSub = toMinorUnits(safePrice.subtotal, currency);
    const lineTax = toMinorUnits(safePrice.tax, currency);
    const lineTotal = toMinorUnits(safePrice.total, currency);
    subtotalMinor += lineSub;
    taxMinor += lineTax;
    inventoryIds.push(result.inventoryId);
    lines.push({
      inventoryId: result.inventoryId,
      locationId: result.locationId,
      screenId: result.screenId,
      charges: safePrice.lines,
      subtotalMinor: lineSub,
      taxMinor: lineTax,
      totalMinor: lineTotal,
      feasibility: result.feasibility,
      freeSlots: result.freeSlots,
      operatingHours: result.operatingHours,
      loopDurationSec: result.loopDurationSec,
      quoteInput: lineInput,
    });
    rateVersions.push({
      inventoryId: result.inventoryId,
      model: safePrice.model,
      meta: safePrice.meta,
    });
  }

  const priorCount = await prisma.quoteRevision.count({
    where: { campaignId: input.campaignId },
  });

  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + DEFAULT_QUOTE_TTL_HOURS * 60 * 60 * 1000);

  await prisma.quoteRevision.updateMany({
    where: { campaignId: input.campaignId, status: "ISSUED" },
    data: { status: "SUPERSEDED", updatedAt: new Date() },
  });

  const quote = await prisma.quoteRevision.create({
    data: {
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      campaignId: input.campaignId,
      mediaPlanId: input.mediaPlanId ?? null,
      revisionNumber: priorCount + 1,
      status: "ISSUED",
      currency,
      subtotalMinor,
      taxMinor,
      totalMinor: subtotalMinor + taxMinor,
      assumptionsJson: {
        holdTtlMinutes: INVENTORY_HOLD_TTL_MINUTES,
        quoteTtlHours: DEFAULT_QUOTE_TTL_HOURS,
        pricingEngine: "play-based-v1",
        customerSafe: true,
      },
      quantitiesJson: { lineCount: lines.length, inventoryIds },
      rateVersionsJson: rateVersions as Prisma.InputJsonValue,
      chargesJson: lines as Prisma.InputJsonValue,
      inventoryIds: inventoryIds as Prisma.InputJsonValue,
      expiresAt,
      createdByUserId: input.actorUserId ?? null,
    },
  });

  return { quote };
}

export async function acceptQuoteRevision(
  prisma: PrismaClient,
  input: {
    quoteId: string;
    actorUserId?: string | null;
    tenantOrganizationId?: string | null;
    idempotencyKey?: string | null;
    mode?: "hold" | "book";
    requireVendorApproval?: boolean;
    allowPartial?: boolean;
  }
) {
  const quote = await prisma.quoteRevision.findUnique({ where: { id: input.quoteId } });
  if (!quote) return { error: "Quote not found" as const };

  if (quote.status === "ACCEPTED" && quote.acceptedBookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: quote.acceptedBookingId },
      include: { items: true },
    });
    return { quote, booking, idempotent: true as const };
  }

  if (quote.status === "ISSUED" && input.idempotencyKey) {
    const orphan = await prisma.booking.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (orphan) {
      const updated = await prisma.quoteRevision.update({
        where: { id: quote.id },
        data: {
          status: "ACCEPTED",
          acceptedBookingId: orphan.id,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await prisma.booking.update({
        where: { id: orphan.id },
        data: { acceptedQuoteRevisionId: quote.id, updatedAt: new Date() },
      });
      return { quote: updated, booking: orphan, idempotent: true as const, recovered: true as const };
    }
  }

  if (quote.status !== "ISSUED") {
    return { error: `Quote cannot be accepted from status ${quote.status}` as const };
  }

  if (quote.expiresAt.getTime() < Date.now()) {
    await prisma.quoteRevision.update({
      where: { id: quote.id },
      data: { status: "EXPIRED", updatedAt: new Date() },
    });
    return { error: "Quote expired" as const };
  }

  if (!quote.campaignId) {
    return { error: "Quote is missing campaignId" as const };
  }

  const charges = Array.isArray(quote.chargesJson)
    ? (quote.chargesJson as Array<Record<string, unknown>>)
    : [];
  const inventoryIds = Array.isArray(quote.inventoryIds)
    ? (quote.inventoryIds as string[])
    : charges.map((c) => String(c.inventoryId));

  let recomputedTotal = 0;
  for (const line of charges) {
    const quoteInput = line.quoteInput as BookingQuoteInput | undefined;
    if (!quoteInput?.inventoryId) {
      return { error: "Quote line missing quoteInput" as const };
    }
    const fresh = await quotePlayBasedBooking(prisma, quoteInput);
    if ("error" in fresh) {
      return { error: fresh.error };
    }
    if (!fresh.feasibility.feasible || fresh.freeSlots < 1) {
      if (!input.allowPartial) {
        return { error: "Availability changed — quote no longer feasible" as const };
      }
      continue;
    }
    recomputedTotal += toMinorUnits(fresh.price.total, fresh.price.currency || quote.currency);
  }

  if (!input.allowPartial && !totalsMatch(recomputedTotal, quote.totalMinor)) {
    return {
      error: "Price changed since quote was issued — request a new quote",
      previousTotalMinor: quote.totalMinor,
      recomputedTotalMinor: recomputedTotal,
      previousTotal: fromMinorUnits(quote.totalMinor, quote.currency),
      recomputedTotal: fromMinorUnits(recomputedTotal, quote.currency),
    };
  }

  const mode = input.mode ?? "book";
  const idempotencyKey = input.idempotencyKey ?? `quote-accept:${quote.id}`;

  const reserve = await holdInventoryForCampaign(
    prisma,
    quote.campaignId,
    inventoryIds,
    mode,
    {
      mediaPlanId: quote.mediaPlanId,
      actorUserId: input.actorUserId,
      tenantOrganizationId: input.tenantOrganizationId ?? quote.tenantOrganizationId,
      idempotencyKey,
      requireVendorApproval: input.requireVendorApproval,
      syncBooking: true,
    }
  );

  if (reserve.held.length === 0) {
    return { error: "No inventory could be reserved — capacity unavailable" as const };
  }

  if (!input.allowPartial && reserve.skipped.length > 0) {
    // Do not leave a partial reservation when the quote required all sites
    if (reserve.held.length > 0 && quote.campaignId) {
      await releaseInventoryForCampaign(prisma, quote.campaignId, reserve.held, {
        actorUserId: input.actorUserId,
        reason: "accept_partial_unavailable",
      });
    }
    return {
      error: "Partial inventory unavailable — quote not accepted",
      held: [] as string[],
      skipped: [...reserve.skipped, ...reserve.held],
    };
  }

  if (!reserve.bookingId) {
    return {
      error: "Reservation succeeded without booking record — quote not marked accepted",
      held: reserve.held,
      skipped: reserve.skipped,
    };
  }

  try {
    const updated = await prisma.quoteRevision.update({
      where: { id: quote.id },
      data: {
        status: "ACCEPTED",
        acceptedBookingId: reserve.bookingId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.booking.update({
      where: { id: reserve.bookingId },
      data: { acceptedQuoteRevisionId: quote.id, updatedAt: new Date() },
    });

    const booking = await prisma.booking.findUnique({
      where: { id: reserve.bookingId },
      include: {
        items: true,
        transitions: { orderBy: { createdAt: "asc" }, take: 100 },
      },
    });

    // Seed ops tasks when booking is confirmed — does NOT mark campaign live
    if (booking && (booking.status === "CONFIRMED" || booking.status === "PARTIALLY_APPROVED")) {
      const { seedExecutionTasksForBooking } = await import("../ops/seed-tasks.js");
      await seedExecutionTasksForBooking(prisma, booking.id, {
        actorUserId: input.actorUserId,
      });
    }

    return {
      quote: updated,
      booking,
      held: reserve.held,
      skipped: reserve.skipped,
      idempotent: false as const,
    };
  } catch (err) {
    return {
      error: "Reservation created but quote accept persistence failed — retry accept",
      bookingId: reserve.bookingId,
      held: reserve.held,
      skipped: reserve.skipped,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
