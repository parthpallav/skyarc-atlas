import type { CampaignLifecycleStatus, PrismaClient } from "@prisma/client";
import { isSiteRequestBrief } from "@skyarc/shared";

/**
 * Recompute campaign lifecycle after site-request / plan approval changes.
 *
 * Rules (connected Media Planner journey):
 * - CANCELLED: all plans rejected / empty after rejects
 * - COMPLETED: flight endDate in the past and at least one APPROVED plan (or prior LIVE)
 * - PENDING_APPROVAL: vendor/item approvals outstanding, or commitments not yet live
 * - DRAFT: nothing approved yet
 * - ACTIVE is NEVER set here — only via authorized mark-live with readiness checks.
 *
 * Plan APPROVED means "current planning revision", not "live campaign".
 */
export async function syncCampaignLifecycle(
  prisma: PrismaClient,
  campaignId: string
): Promise<CampaignLifecycleStatus> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      lifecycleStatus: true,
      brief: { select: { structuredRequirementsJson: true } },
      mediaPlans: {
        select: {
          id: true,
          name: true,
          status: true,
          items: { select: { approvalStatus: true } },
        },
      },
    },
  });

  if (!campaign) return "DRAFT";

  // Preserve explicit LIVE / COMPLETED / CANCELLED set by mark-live or operators,
  // except when we can detect completion/cancellation from plans.
  const now = Date.now();
  const plans = campaign.mediaPlans;
  const isRequestCampaign = isSiteRequestBrief(campaign.brief?.structuredRequirementsJson);

  const requestPlans = plans.filter(
    (p) =>
      isRequestCampaign ||
      p.status === "DRAFT" ||
      p.name.toLowerCase().includes("request")
  );
  const relevantPlans = requestPlans.length > 0 ? requestPlans : plans;

  const hasDraftRequest = relevantPlans.some((p) => p.status === "DRAFT");
  const hasPendingItems = relevantPlans.some((p) =>
    p.items.some((i) => i.approvalStatus === "PENDING")
  );
  const approvedPlans = relevantPlans.filter((p) => p.status === "APPROVED");
  const rejectedOnly =
    relevantPlans.length > 0 &&
    relevantPlans.every((p) => p.status === "REJECTED" || p.items.length === 0);

  let next: CampaignLifecycleStatus = "DRAFT";

  if (rejectedOnly && approvedPlans.length === 0) {
    next = "CANCELLED";
  } else if (
    campaign.endDate &&
    campaign.endDate.getTime() < now &&
    (approvedPlans.length > 0 || campaign.lifecycleStatus === "ACTIVE")
  ) {
    next = "COMPLETED";
  } else if (campaign.lifecycleStatus === "ACTIVE") {
    // Mark-live is sticky until flight completes or cancel.
    next = "ACTIVE";
  } else if (hasDraftRequest || hasPendingItems || approvedPlans.length > 0) {
    // Approved current plan and/or pending vendor items → awaiting commitments / launch.
    next = "PENDING_APPROVAL";
  } else if (plans.some((p) => p.status === "PROPOSED")) {
    next = "DRAFT";
  }

  if (next !== campaign.lifecycleStatus) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { lifecycleStatus: next },
    });
  }

  return next;
}
