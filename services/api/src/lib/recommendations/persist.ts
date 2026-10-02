/**
 * Persist commercial recommendations. Not a quote/reservation ledger.
 * Reconciles duplicate triggers; expired rows must be recalculated before apply.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { RULE_VERSION } from "./continuity-detect.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type ActionHistoryEntry = {
  at: string;
  action: string;
  actorUserId?: string | null;
  detail?: Record<string, unknown>;
};

export function appendActionHistory(
  existing: unknown,
  entry: ActionHistoryEntry
): ActionHistoryEntry[] {
  const prev = Array.isArray(existing) ? (existing as ActionHistoryEntry[]) : [];
  return [...prev, entry].slice(-50);
}

export function defaultExpiry(from = new Date(), hours = 24): Date {
  return new Date(from.getTime() + hours * 3_600_000);
}

export function isRecommendationStale(row: {
  status: string;
  expiresAt: Date;
  freshnessLabel?: string | null;
}): boolean {
  if (row.status === "EXPIRED" || row.status === "SUPERSEDED") return true;
  if (row.expiresAt.getTime() < Date.now()) return true;
  if (row.freshnessLabel === "stale") return true;
  return false;
}

export async function upsertRecommendation(
  db: Db,
  input: {
    tenantOrganizationId?: string | null;
    kind: "CONTINUITY_REPLACEMENT" | "FILL_RATE_PACKAGE";
    method?: "DETERMINISTIC_RULE" | "HEURISTIC";
    triggerKey: string;
    triggerType: string;
    campaignId?: string | null;
    bookingId?: string | null;
    bookingItemId?: string | null;
    observedAt?: Date;
    expiresAt?: Date;
    inputSnapshot: Record<string, unknown>;
    suggestions: unknown[];
    explanation?: string | null;
    pricingAvailable?: boolean;
    costDataComplete?: boolean;
    marginSuppressed?: boolean;
    actorUserId?: string | null;
  }
) {
  const existing = await db.commercialRecommendation.findUnique({
    where: { triggerKey: input.triggerKey },
  });

  const expiresAt = input.expiresAt ?? defaultExpiry(input.observedAt);
  const historyEntry: ActionHistoryEntry = {
    at: new Date().toISOString(),
    action: existing ? "reconcile_trigger" : "create",
    actorUserId: input.actorUserId ?? null,
    detail: { ruleVersion: RULE_VERSION },
  };

  if (existing) {
    // Already applied / dismissed — do not reopen silently; mark superseded only if still open/expired
    if (existing.status === "APPLIED" || existing.status === "APPROVED") {
      return { recommendation: existing, reconciled: true as const, skipped: true as const };
    }
    if (existing.status === "DISMISSED") {
      return { recommendation: existing, reconciled: true as const, skipped: true as const };
    }

    const updated = await db.commercialRecommendation.update({
      where: { id: existing.id },
      data: {
        status: "OPEN",
        method: input.method ?? existing.method,
        ruleVersion: RULE_VERSION,
        triggerType: input.triggerType,
        campaignId: input.campaignId ?? existing.campaignId,
        bookingId: input.bookingId ?? existing.bookingId,
        bookingItemId: input.bookingItemId ?? existing.bookingItemId,
        observedAt: input.observedAt ?? new Date(),
        expiresAt,
        inputSnapshotJson: input.inputSnapshot as Prisma.InputJsonValue,
        suggestionsJson: input.suggestions as Prisma.InputJsonValue,
        explanation: input.explanation ?? existing.explanation,
        freshnessLabel: "fresh",
        pricingAvailable: input.pricingAvailable ?? true,
        costDataComplete: input.costDataComplete ?? false,
        marginSuppressed: input.marginSuppressed ?? false,
        actionHistoryJson: appendActionHistory(
          existing.actionHistoryJson,
          historyEntry
        ) as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
    return { recommendation: updated, reconciled: true as const, skipped: false as const };
  }

  const created = await db.commercialRecommendation.create({
    data: {
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      kind: input.kind,
      status: "OPEN",
      method: input.method ?? "DETERMINISTIC_RULE",
      ruleVersion: RULE_VERSION,
      triggerKey: input.triggerKey,
      triggerType: input.triggerType,
      campaignId: input.campaignId ?? null,
      bookingId: input.bookingId ?? null,
      bookingItemId: input.bookingItemId ?? null,
      observedAt: input.observedAt ?? new Date(),
      expiresAt,
      inputSnapshotJson: input.inputSnapshot as Prisma.InputJsonValue,
      suggestionsJson: input.suggestions as Prisma.InputJsonValue,
      explanation: input.explanation ?? null,
      freshnessLabel: "fresh",
      pricingAvailable: input.pricingAvailable ?? true,
      costDataComplete: input.costDataComplete ?? false,
      marginSuppressed: input.marginSuppressed ?? false,
      actionHistoryJson: [historyEntry] as Prisma.InputJsonValue,
    },
  });
  return { recommendation: created, reconciled: false as const, skipped: false as const };
}

export async function markExpiredOpen(db: Db) {
  const now = new Date();
  const result = await db.commercialRecommendation.updateMany({
    where: { status: "OPEN", expiresAt: { lt: now } },
    data: { status: "EXPIRED", freshnessLabel: "stale", updatedAt: now },
  });
  return { expired: result.count };
}
