import { describe, expect, it } from "vitest";
import type { CampaignLifecycleStatus } from "@prisma/client";

/**
 * Pure mirror of sync rules for unit coverage without DB.
 * Keep in sync with campaign-lifecycle.ts
 */
function deriveLifecycle(input: {
  now: number;
  endDate?: Date | null;
  plans: Array<{
    status: string;
    name: string;
    items: Array<{ approvalStatus: string }>;
  }>;
  isRequestCampaign: boolean;
}): CampaignLifecycleStatus {
  const { now, endDate, plans, isRequestCampaign } = input;
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
    relevantPlans.every((p) => p.status === "APPROVED" || p.status === "REJECTED");

  if (rejectedOnly && approvedPlans.length === 0) return "CANCELLED";
  if (endDate && endDate.getTime() < now && approvedPlans.length > 0) return "COMPLETED";
  if (hasDraftRequest || hasPendingItems) return "PENDING_APPROVAL";
  if (allRequestsApproved) return "ACTIVE";
  if (approvedPlans.length > 0 || plans.some((p) => p.status === "PROPOSED")) {
    return plans.some((p) => p.status === "APPROVED") ? "ACTIVE" : "DRAFT";
  }
  return "DRAFT";
}

describe("campaign lifecycle after site-request approvals", () => {
  const flightEnd = new Date("2026-12-31T00:00:00.000Z");
  const now = new Date("2026-10-01T00:00:00.000Z").getTime();

  it("stays PENDING while any request is DRAFT", () => {
    expect(
      deriveLifecycle({
        now,
        endDate: flightEnd,
        isRequestCampaign: true,
        plans: [
          {
            status: "DRAFT",
            name: "Request · 2 sites",
            items: [{ approvalStatus: "PENDING" }, { approvalStatus: "PENDING" }],
          },
        ],
      })
    ).toBe("PENDING_APPROVAL");
  });

  it("becomes ACTIVE when all site requests for the flight are APPROVED", () => {
    expect(
      deriveLifecycle({
        now,
        endDate: flightEnd,
        isRequestCampaign: true,
        plans: [
          {
            status: "APPROVED",
            name: "Request · 2 sites",
            items: [{ approvalStatus: "APPROVED" }, { approvalStatus: "APPROVED" }],
          },
        ],
      })
    ).toBe("ACTIVE");
  });

  it("stays PENDING until every vendor has responded on multi-vendor request", () => {
    expect(
      deriveLifecycle({
        now,
        endDate: flightEnd,
        isRequestCampaign: true,
        plans: [
          {
            status: "DRAFT",
            name: "Request · 3 sites",
            items: [
              { approvalStatus: "APPROVED" },
              { approvalStatus: "PENDING" },
              { approvalStatus: "APPROVED" },
            ],
          },
        ],
      })
    ).toBe("PENDING_APPROVAL");
  });

  it("marks COMPLETED after flight end when previously approved", () => {
    expect(
      deriveLifecycle({
        now: new Date("2027-01-15T00:00:00.000Z").getTime(),
        endDate: flightEnd,
        isRequestCampaign: true,
        plans: [
          {
            status: "APPROVED",
            name: "Request · 1 site",
            items: [{ approvalStatus: "APPROVED" }],
          },
        ],
      })
    ).toBe("COMPLETED");
  });
});
