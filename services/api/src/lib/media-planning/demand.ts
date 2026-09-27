/**
 * Calm demand signals for media-plan / PDF (customer-safe).
 * Critical styling only when digital remaining slots are very low.
 */

export type SiteDemandView = {
  planCount: number;
  viewersNow: number;
  highDemand: boolean;
  slotsOpen: number | null;
  slotCapacity: number | null;
  /** True when digital remaining is critically low (≤1 open or ≤15% of capacity). */
  criticallyLowSlots: boolean;
  /** One-line customer copy for chips / PDF. */
  summaryLine: string | null;
};

/** Threshold: ≤1 open slot OR ≤15% of capacity remaining. */
export function isCriticallyLowSlots(
  slotsOpen: number | null | undefined,
  slotCapacity: number | null | undefined
): boolean {
  if (slotsOpen == null || slotCapacity == null || slotCapacity <= 0) return false;
  if (slotsOpen <= 1) return true;
  return slotsOpen / slotCapacity <= 0.15;
}

export function buildSiteDemandView(input: {
  planCount: number;
  viewersNow?: number;
  slotsOpen?: number | null;
  slotCapacity?: number | null;
}): SiteDemandView {
  const planCount = Math.max(0, Math.round(input.planCount || 0));
  const viewersNow = Math.max(0, Math.round(input.viewersNow || 0));
  const slotsOpen = input.slotsOpen ?? null;
  const slotCapacity = input.slotCapacity ?? null;
  const criticallyLowSlots = isCriticallyLowSlots(slotsOpen, slotCapacity);
  const highDemand =
    planCount >= 2 || viewersNow >= 2 || criticallyLowSlots || (planCount >= 1 && viewersNow >= 1);

  const parts: string[] = [];
  if (planCount > 0) {
    parts.push(planCount === 1 ? "In 1 media plan" : `In ${planCount} media plans`);
  }
  if (highDemand && planCount < 2) {
    parts.push("High demand");
  } else if (highDemand && planCount >= 2) {
    /* plan count already implies demand */
  }
  if (slotsOpen != null && slotCapacity != null && slotCapacity > 0) {
    parts.push(`${slotsOpen} of ${slotCapacity} slots open`);
  }

  return {
    planCount,
    viewersNow,
    highDemand,
    slotsOpen,
    slotCapacity,
    criticallyLowSlots,
    summaryLine: parts.length ? parts.join(" · ") : null,
  };
}
