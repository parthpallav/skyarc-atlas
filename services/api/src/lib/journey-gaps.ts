import { isCampaignPlanningLocked } from "@skyarc/shared";

/** Journey-gap behaviors (planning lock, vendor pending on APPROVED, live-proof policy, etc.). Configurable via runtime variable without code deployment. */
export function journeyGapsEnabled(): boolean {
  const flag = (process.env.JOURNEY_GAPS ?? process.env.NEXT_PUBLIC_JOURNEY_GAPS)?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return true;
}

export function campaignPlanningLockedForApi(lifecycleStatus?: string | null): boolean {
  return journeyGapsEnabled() && isCampaignPlanningLocked(lifecycleStatus);
}
