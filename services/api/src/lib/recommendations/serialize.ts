/**
 * Staff vs customer serialization for commercial recommendations.
 * Internal margin/cost fields never appear in customer views.
 */

export type CommercialRecommendationRow = {
  id: string;
  tenantOrganizationId: string | null;
  kind: string;
  status: string;
  method: string;
  ruleVersion: string;
  triggerKey: string;
  triggerType: string;
  campaignId: string | null;
  bookingId: string | null;
  bookingItemId: string | null;
  observedAt: Date;
  expiresAt: Date;
  inputSnapshotJson: unknown;
  suggestionsJson: unknown;
  explanation: string | null;
  freshnessLabel: string;
  pricingAvailable: boolean;
  costDataComplete: boolean;
  marginSuppressed: boolean;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  appliedChangeJson: unknown;
  actionHistoryJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function stripMarginFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMarginFields);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        /margin|vendorCost|vendorTotal|costData|grossProfit|skyarcRevenue/i.test(k)
      ) {
        continue;
      }
      out[k] = stripMarginFields(v);
    }
    return out;
  }
  return value;
}

export function serializeRecommendationStaff(row: CommercialRecommendationRow) {
  return {
    id: row.id,
    tenantOrganizationId: row.tenantOrganizationId,
    kind: row.kind,
    status: row.status,
    method: row.method,
    ruleVersion: row.ruleVersion,
    triggerKey: row.triggerKey,
    triggerType: row.triggerType,
    campaignId: row.campaignId,
    bookingId: row.bookingId,
    bookingItemId: row.bookingItemId,
    observedAt: row.observedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    inputSnapshot: row.inputSnapshotJson,
    suggestions: row.suggestionsJson,
    explanation: row.explanation,
    freshnessLabel: row.freshnessLabel,
    pricingAvailable: row.pricingAvailable,
    costDataComplete: row.costDataComplete,
    marginSuppressed: row.marginSuppressed,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByUserId: row.reviewedByUserId,
    appliedChange: row.appliedChangeJson,
    actionHistory: row.actionHistoryJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stale: row.expiresAt.getTime() < Date.now() || row.freshnessLabel === "stale",
  };
}

/** Customer-safe: no costs, margins, or internal action history. */
export function serializeRecommendationCustomer(row: CommercialRecommendationRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    method: row.method,
    triggerType: row.triggerType,
    campaignId: row.campaignId,
    observedAt: row.observedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    explanation: row.explanation,
    freshnessLabel: row.freshnessLabel,
    suggestions: stripMarginFields(row.suggestionsJson),
    pricingAvailable: row.pricingAvailable,
    // Explicitly omit: costDataComplete, marginSuppressed, actionHistory, appliedChange internals
  };
}
