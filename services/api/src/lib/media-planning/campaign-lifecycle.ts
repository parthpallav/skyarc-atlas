import type { CampaignLifecycleStatus, PrismaClient } from "@prisma/client";
import { isSiteRequestBrief } from "@skyarc/shared";

/**
 * Recompute campaign lifecycle after site-request / plan approval changes.
 *
 * Rules:
 * - CANCELLED: all plans rejected / empty after rejects
 * - COMPLETED: flight endDate in the past and at least one APPROVED plan
 * - PENDING_APPROVAL: any DRAFT request plan (or pending item approvals) remains
 * - ACTIVE: every site-request plan for this campaign is APPROVED (none DRAFT),
 *   inventory is booked for the flight — campaign is live for that period
 * - DRAFT: nothing approved yet
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
  const allRequestsApproved =
    relevantPlans.length > 0 &&
    !hasDraftRequest &&
    !hasPendingItems &&
    approvedPlans.length > 0 &&
    relevantPlans.every((p) => p.status === "APPROVED" || p.status === "REJECTED") &&
    approvedPlans.length >= 1;

  let next: CampaignLifecycleStatus = "DRAFT";

  if (rejectedOnly && approvedPlans.length === 0) {
    next = "CANCELLED";
  } else if (
    campaign.endDate &&
    campaign.endDate.getTime() < now &&
    approvedPlans.length > 0
  ) {
    next = "COMPLETED";
  } else if (hasDraftRequest || hasPendingItems) {
    next = "PENDING_APPROVAL";
  } else if (allRequestsApproved) {
    // Fully approved for the flight window → active campaign
    next = "ACTIVE";
  } else if (approvedPlans.length > 0 || plans.some((p) => p.status === "PROPOSED")) {
    next = plans.some((p) => p.status === "APPROVED") ? "ACTIVE" : "DRAFT";
  }

  if (next !== campaign.lifecycleStatus) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { lifecycleStatus: next },
    });
  }

  return next;
}
