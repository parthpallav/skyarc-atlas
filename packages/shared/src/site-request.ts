/** Helpers for site / network inventory requests (vs full campaign planning). */

export const SITE_REQUEST_KIND = "SITE_REQUEST" as const;

export type SiteRequestKind = typeof SITE_REQUEST_KIND;

export function isSiteRequestBrief(
  structured: unknown
): structured is { requestKind: SiteRequestKind } & Record<string, unknown> {
  if (!structured || typeof structured !== "object") return false;
  return (structured as { requestKind?: string }).requestKind === SITE_REQUEST_KIND;
}

export function siteRequestBrief(extra?: Record<string, unknown>) {
  return {
    requestKind: SITE_REQUEST_KIND,
    budget: 1,
    ...extra,
  };
}

export type CampaignLifecycleStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED";

/**
 * Human label for campaign lifecycle.
 * ACTIVE means the campaign was marked live (execution authorized) — not merely that a plan is approved.
 * Before flight start, callers should prefer "Scheduled" via campaignLifecycleDisplayLabel.
 */
export function campaignLifecycleLabel(status: CampaignLifecycleStatus | string | null | undefined) {
  switch (status) {
    case "PENDING_APPROVAL":
      return "Pending approvals";
    case "ACTIVE":
      return "Live";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Draft";
  }
}

/** Display label that distinguishes Scheduled (marked live, flight not started) from Live. */
export function campaignLifecycleDisplayLabel(input: {
  status?: CampaignLifecycleStatus | string | null;
  startDate?: Date | string | null;
  now?: Date;
}): string {
  const status = input.status ?? "DRAFT";
  if (status === "ACTIVE") {
    const start = input.startDate
      ? input.startDate instanceof Date
        ? input.startDate
        : new Date(input.startDate)
      : null;
    const now = input.now ?? new Date();
    if (start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
      return "Scheduled";
    }
    return "Live";
  }
  return campaignLifecycleLabel(status);
}

/**
 * After Mark live (or flight complete / cancel), campaign brief, dates, current plan,
 * and plan mix are frozen — hierarchy below was already approved to authorize launch.
 */
export function isCampaignPlanningLocked(
  status: CampaignLifecycleStatus | string | null | undefined
): boolean {
  return status === "ACTIVE" || status === "COMPLETED" || status === "CANCELLED";
}

/** User-facing reason when a locked campaign mutation is attempted. */
export function campaignPlanningLockMessage(
  status: CampaignLifecycleStatus | string | null | undefined
): string {
  if (status === "COMPLETED") {
    return "This campaign is completed. Flight dates, brief, and media plans can no longer be changed.";
  }
  if (status === "CANCELLED") {
    return "This campaign is cancelled. Planning changes are not allowed.";
  }
  return "This campaign is live. Flight dates, brief, current plan, and site mix are locked.";
}
