import { isCampaignPlanningLocked } from "@skyarc/shared";

/** Opt-in journey-gap behaviors (planning lock, vendor pending on APPROVED, live-proof policy, etc.). */
export function journeyGapsEnabled(): boolean {
  return process.env.JOURNEY_GAPS === "true";
}

export function campaignPlanningLockedForApi(lifecycleStatus?: string | null): boolean {
  return journeyGapsEnabled() && isCampaignPlanningLocked(lifecycleStatus);
}
