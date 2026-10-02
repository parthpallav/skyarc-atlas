/**
 * Approve / dismiss / apply commercial recommendations.
 * Apply revalidates availability + price, then amends booking.
 * Preserve original booking when amendment fails. Prevent duplicate amendments.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { amendBooking } from "../booking/amend.js";
import {
  customerRateForInventory,
  flightCostFromStoredRate,
  ratePeriodForInventory,
} from "../media-planning/rates.js";
import { isInventoryFreeForFlight } from "../media-planning/availability.js";
import { enqueueReminder } from "../billing/reminders.js";
import {
  appendActionHistory,
  isRecommendationStale,
} from "./persist.js";
import type { ReplacementSuggestion } from "./replacements.js";

type Db = PrismaClient;

export async function approveRecommendation(
  db: Db,
  id: string,
  actorUserId: string
) {
  const row = await db.commercialRecommendation.findUnique({ where: { id } });
  if (!row) return { error: "Recommendation not found" as const };
  if (row.status === "APPLIED") return { error: "Already applied" as const };
  if (row.status === "DISMISSED") return { error: "Already dismissed" as const };
  if (isRecommendationStale(row)) {
    return {
      error: "Recommendation expired or stale — recalculate before approval" as const,
    };
  }
  if (row.status !== "OPEN" && row.status !== "APPROVED") {
    return { error: `Cannot approve from status ${row.status}` as const };
  }

  const updated = await db.commercialRecommendation.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedByUserId: actorUserId,
      actionHistoryJson: appendActionHistory(row.actionHistoryJson, {
        at: new Date().toISOString(),
        action: "approve",
        actorUserId,
      }) as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });

  // Staff notification via reminder → Bridge when configured (dry-run vs live preserved)
  await enqueueReminder(db, {
    tenantOrganizationId: row.tenantOrganizationId,
    campaignId: row.campaignId,
    kind: "OTHER",
    dueAt: new Date(),
    payload: {
      kind: "RECOMMENDATION_APPROVED",
      recommendationId: row.id,
      triggerType: row.triggerType,
      summary: `Recommendation ${row.kind} approved — apply still requires explicit action`,
    },
  });

  return { recommendation: updated };
}

export async function dismissRecommendation(
  db: Db,
  id: string,
  actorUserId: string,
  reason?: string
) {
  const row = await db.commercialRecommendation.findUnique({ where: { id } });
  if (!row) return { error: "Recommendation not found" as const };
  if (row.status === "APPLIED") return { error: "Already applied" as const };
  if (row.status === "DISMISSED") return { recommendation: row, idempotent: true as const };

  const updated = await db.commercialRecommendation.update({
    where: { id },
    data: {
      status: "DISMISSED",
      reviewedAt: new Date(),
      reviewedByUserId: actorUserId,
      actionHistoryJson: appendActionHistory(row.actionHistoryJson, {
        at: new Date().toISOString(),
        action: "dismiss",
        actorUserId,
        detail: { reason: reason ?? null },
      }) as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });
  return { recommendation: updated, idempotent: false as const };
}

/**
 * Apply an approved continuity replacement: remove disrupted face, add chosen replacement.
 * Revalidates capacity and price at apply time. Does not reserve until amend succeeds.
 */
export async function applyContinuityReplacement(
  db: Db,
  input: {
    recommendationId: string;
    chosenInventoryId: string;
    actorUserId: string;
  }
) {
  const row = await db.commercialRecommendation.findUnique({
    where: { id: input.recommendationId },
  });
  if (!row) return { error: "Recommendation not found" as const };
  if (row.status === "APPLIED") {
    return { error: "Duplicate amendment prevented — already applied" as const, idempotent: true as const };
  }
  if (row.status !== "APPROVED") {
    return { error: "Authorized approval required before amending a booking" as const };
  }
  if (isRecommendationStale(row)) {
    return { error: "Stale recommendation — recalculate before apply" as const };
  }
  if (row.kind !== "CONTINUITY_REPLACEMENT") {
    return { error: "Only continuity replacements amend bookings via this path" as const };
  }
  if (!row.bookingId || !row.bookingItemId) {
    return { error: "Recommendation missing booking references" as const };
  }

  const suggestions = (Array.isArray(row.suggestionsJson)
    ? row.suggestionsJson
    : []) as ReplacementSuggestion[];
  const chosen = suggestions.find((s) => s.inventoryId === input.chosenInventoryId);
  if (!chosen) return { error: "Chosen inventory is not in recommendation suggestions" as const };

  const bookingItem = await db.bookingItem.findUnique({
    where: { id: row.bookingItemId },
    include: {
      booking: true,
      inventory: true,
    },
  });
  if (!bookingItem || bookingItem.bookingId !== row.bookingId) {
    return { error: "Booking item not found for recommendation" as const };
  }

  const replacement = await db.inventory.findUnique({
    where: { id: input.chosenInventoryId },
    include: {
      rateCards: { take: 1, orderBy: { effectiveFrom: "desc" } },
      screen: {
        include: {
          location: { select: { id: true, name: true, city: true, skyarcCommercialJson: true } },
        },
      },
      availabilityWindows: true,
    },
  });
  if (!replacement) return { error: "Replacement inventory not found" as const };

  const startDate = bookingItem.booking.startDate;
  const endDate = bookingItem.booking.endDate;

  const free = isInventoryFreeForFlight(
    {
      status: replacement.status,
      screenStatus: null,
      inventoryType: replacement.inventoryType,
      slotCapacity: replacement.slotCapacity,
      availabilityWindows: replacement.availabilityWindows,
    },
    startDate,
    endDate
  );
  if (!free) {
    await db.commercialRecommendation.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        freshnessLabel: "stale",
        actionHistoryJson: appendActionHistory(row.actionHistoryJson, {
          at: new Date().toISOString(),
          action: "apply_failed_capacity",
          actorUserId: input.actorUserId,
          detail: { chosenInventoryId: input.chosenInventoryId },
        }) as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    return {
      error: "Replacement no longer available — original booking preserved" as const,
      preserved: true as const,
    };
  }

  const liveRate = customerRateForInventory(replacement);
  if (liveRate <= 0) {
    return { error: "PRICING_UNAVAILABLE on replacement — cannot amend" as const };
  }
  const livePeriod = ratePeriodForInventory(replacement);
  const liveFlight = flightCostFromStoredRate({
    rateAmount: liveRate,
    ratePeriod: livePeriod,
    startDate,
    endDate,
  });

  // Commercial terms may differ from suggestion snapshot — record delta
  const suggestedFlight = chosen.flightCost;
  const priceDrift = liveFlight - suggestedFlight;

  const amend = await amendBooking(db, {
    bookingId: row.bookingId,
    actorUserId: input.actorUserId,
    addInventoryIds: [input.chosenInventoryId],
    removeInventoryIds: [bookingItem.inventoryId],
  });

  if (amend && typeof amend === "object" && "error" in amend) {
    await db.commercialRecommendation.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        actionHistoryJson: appendActionHistory(row.actionHistoryJson, {
          at: new Date().toISOString(),
          action: "apply_failed_amend",
          actorUserId: input.actorUserId,
          detail: { error: amend.error, preserved: true },
        }) as Prisma.InputJsonValue,
        appliedChangeJson: {
          failed: true,
          preserved: true,
          error: amend.error,
        } as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    return {
      error: String(amend.error),
      preserved: true as const,
      recommendationFailed: true as const,
    };
  }

  const change = {
    removedInventoryId: bookingItem.inventoryId,
    addedInventoryId: input.chosenInventoryId,
    bookingId: row.bookingId,
    suggestedFlightCost: suggestedFlight,
    revalidatedFlightCost: liveFlight,
    commercialDelta: liveFlight - (chosen.commercialDelta != null
      ? suggestedFlight - chosen.commercialDelta
      : suggestedFlight),
    priceDriftFromSuggestion: priceDrift,
    revisedCommercialTerms: priceDrift !== 0,
  };

  const updated = await db.commercialRecommendation.update({
    where: { id: row.id },
    data: {
      status: "APPLIED",
      appliedChangeJson: change as Prisma.InputJsonValue,
      actionHistoryJson: appendActionHistory(row.actionHistoryJson, {
        at: new Date().toISOString(),
        action: "apply",
        actorUserId: input.actorUserId,
        detail: change,
      }) as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });

  await enqueueReminder(db, {
    tenantOrganizationId: row.tenantOrganizationId,
    campaignId: row.campaignId,
    kind: "OTHER",
    dueAt: new Date(),
    payload: {
      kind: "BOOKING_UPDATE",
      recommendationId: row.id,
      bookingId: row.bookingId,
      summary: `Continuity replacement applied: ${bookingItem.inventoryId} → ${input.chosenInventoryId}`,
    },
  });

  return { recommendation: updated, booking: amend, change };
}
