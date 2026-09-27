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

export function campaignLifecycleLabel(status: CampaignLifecycleStatus | string | null | undefined) {
  switch (status) {
    case "PENDING_APPROVAL":
      return "Pending approvals";
    case "ACTIVE":
      return "Active";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Draft";
  }
}
