import type { PrismaClient } from "@prisma/client";

export type ActivationBlocker = {
  code: string;
  message: string;
};

export type CampaignActivationReadiness = {
  ready: boolean;
  blockers: ActivationBlocker[];
  checks: {
    hasCurrentPlan: boolean;
    hasConfirmedCommitments: boolean;
    vendorApprovalsComplete: boolean;
    creativesReady: boolean;
    flightNotEnded: boolean;
    partialLaunchAllowed: boolean;
    confirmedItemCount: number;
    pendingVendorItemCount: number;
    rejectedItemCount: number;
  };
  /** True when some items are confirmed and some are not — UI must show partial launch. */
  partialLaunch: boolean;
};

/**
 * Server-side readiness for authorized Mark live.
 * Export / plan approve / Orbit telemetry must never call this automatically.
 */
export async function evaluateCampaignActivationReadiness(
  prisma: PrismaClient,
  campaignId: string
): Promise<CampaignActivationReadiness> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      endDate: true,
      lifecycleStatus: true,
      mediaPlans: {
        where: { status: "APPROVED" },
        select: {
          id: true,
          items: { select: { id: true, approvalStatus: true, inventoryId: true } },
        },
        take: 1,
      },
      bookings: {
        where: { status: { not: "CANCELLED" } },
        select: {
          id: true,
          status: true,
          executionStatus: true,
          expiresAt: true,
          items: {
            select: {
              id: true,
              status: true,
              inventoryId: true,
            },
          },
          creatives: {
            select: { status: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const blockers: ActivationBlocker[] = [];
  if (!campaign) {
    return {
      ready: false,
      blockers: [{ code: "CAMPAIGN_NOT_FOUND", message: "Campaign not found" }],
      checks: {
        hasCurrentPlan: false,
        hasConfirmedCommitments: false,
        vendorApprovalsComplete: false,
        creativesReady: false,
        flightNotEnded: false,
        partialLaunchAllowed: false,
        confirmedItemCount: 0,
        pendingVendorItemCount: 0,
        rejectedItemCount: 0,
      },
      partialLaunch: false,
    };
  }

  const currentPlan = campaign.mediaPlans[0] ?? null;
  const hasCurrentPlan = Boolean(currentPlan);
  if (!hasCurrentPlan) {
    blockers.push({
      code: "NO_CURRENT_PLAN",
      message: "Approve a planning revision as the current plan before marking live.",
    });
  }

  const now = Date.now();
  const flightNotEnded = !campaign.endDate || campaign.endDate.getTime() >= now;
  if (!flightNotEnded) {
    blockers.push({
      code: "FLIGHT_ENDED",
      message: "Flight end date has passed; mark the campaign completed instead of live.",
    });
  }

  const activeBookings = campaign.bookings.filter((b) =>
    ["HELD", "PENDING_VENDOR_APPROVAL", "PARTIALLY_APPROVED", "CONFIRMED"].includes(b.status)
  );
  const allItems = activeBookings.flatMap((b) => b.items);
  const confirmedItems = allItems.filter((i) => i.status === "CONFIRMED" || i.status === "APPROVED");
  const pendingVendor = allItems.filter(
    (i) => i.status === "PENDING_VENDOR_APPROVAL" || i.status === "HELD" || i.status === "REQUESTED"
  );
  const rejectedItems = allItems.filter((i) => i.status === "REJECTED" || i.status === "CANCELLED");

  const hasConfirmedCommitments = confirmedItems.length > 0;
  if (!hasConfirmedCommitments) {
    blockers.push({
      code: "NO_CONFIRMED_COMMITMENTS",
      message: "Confirm inventory commitments (booked capacity) before marking live.",
    });
  }

  // Vendor approvals: every non-rejected item on active bookings must be CONFIRMED/APPROVED.
  const openVendorItems = pendingVendor.length;
  const vendorApprovalsComplete = openVendorItems === 0 && hasConfirmedCommitments;
  if (openVendorItems > 0) {
    blockers.push({
      code: "VENDOR_APPROVALS_PENDING",
      message: `${openVendorItems} inventory item(s) still await vendor approval or confirmation.`,
    });
  }

  // Creative: when rows exist, all must be APPROVED. Absence means not required for this booking.
  const creatives = activeBookings.flatMap((b) => b.creatives);
  const creativesReady = creatives.every((c) => c.status === "APPROVED");
  if (!creativesReady) {
    blockers.push({
      code: "CREATIVE_NOT_READY",
      message: "Creative approval is required for this booking before launch.",
    });
  }

  // Partial launch: some confirmed, some rejected/pending — not ready unless all pending cleared.
  const partialLaunch =
    hasConfirmedCommitments && (rejectedItems.length > 0 || openVendorItems > 0);
  const partialLaunchAllowed = false; // policy: require full confirmed set for Mark live

  if (partialLaunch && !partialLaunchAllowed && openVendorItems === 0 && rejectedItems.length > 0) {
    // All remaining are rejected — allow live on confirmed subset with explicit note.
    // Remove NO_CONFIRMED if we have confirmed; add informational partial blocker only when pending.
  }

  const ready =
    blockers.length === 0 &&
    hasCurrentPlan &&
    hasConfirmedCommitments &&
    vendorApprovalsComplete &&
    creativesReady &&
    flightNotEnded;

  return {
    ready,
    blockers,
    checks: {
      hasCurrentPlan,
      hasConfirmedCommitments,
      vendorApprovalsComplete,
      creativesReady,
      flightNotEnded,
      partialLaunchAllowed,
      confirmedItemCount: confirmedItems.length,
      pendingVendorItemCount: openVendorItems,
      rejectedItemCount: rejectedItems.length,
    },
    partialLaunch,
  };
}

export async function markCampaignLive(
  prisma: PrismaClient,
  input: {
    campaignId: string;
    actorUserId: string;
    reason?: string | null;
  }
): Promise<{
  lifecycleStatus: "ACTIVE";
  readiness: CampaignActivationReadiness;
  bookingIds: string[];
}> {
  const readiness = await evaluateCampaignActivationReadiness(prisma, input.campaignId);
  if (!readiness.ready) {
    const err = new Error(
      readiness.blockers.map((b) => b.message).join(" ") || "Campaign is not ready to mark live"
    );
    (err as Error & { readiness: CampaignActivationReadiness }).readiness = readiness;
    throw err;
  }

  const bookings = await prisma.booking.findMany({
    where: {
      campaignId: input.campaignId,
      status: { in: ["CONFIRMED", "PARTIALLY_APPROVED"] },
    },
    select: { id: true, executionStatus: true, status: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: input.campaignId },
      data: { lifecycleStatus: "ACTIVE" },
    });

    for (const booking of bookings) {
      if (booking.executionStatus === "NOT_STARTED") {
        await tx.booking.update({
          where: { id: booking.id },
          data: { executionStatus: "IN_PROGRESS", updatedAt: new Date() },
        });
      }
      await tx.bookingTransition.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: "MARK_LIVE",
          actorUserId: input.actorUserId,
          reason: input.reason ?? "mark_live",
        },
      });
    }
  });

  return {
    lifecycleStatus: "ACTIVE",
    readiness,
    bookingIds: bookings.map((b) => b.id),
  };
}

/** Commitment summary for planners — not a customer e-sign agreement. */
export async function getCampaignCommitmentSummary(
  prisma: PrismaClient,
  campaignId: string
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      lifecycleStatus: true,
      advertiser: { select: { id: true, name: true } },
      mediaPlans: {
        where: { status: "APPROVED" },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              inventoryId: true,
              approvalStatus: true,
            },
          },
        },
        take: 1,
      },
      bookings: {
        where: { status: { not: "CANCELLED" } },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          executionStatus: true,
          expiresAt: true,
          startDate: true,
          endDate: true,
          mediaPlanId: true,
          updatedAt: true,
          items: {
            select: {
              id: true,
              inventoryId: true,
              status: true,
              slotsConsumed: true,
              vendorOrganizationId: true,
            },
          },
          transitions: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              fromStatus: true,
              toStatus: true,
              actorUserId: true,
              reason: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!campaign) return null;

  const currentPlan = campaign.mediaPlans[0] ?? null;
  const readiness = await evaluateCampaignActivationReadiness(prisma, campaignId);

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    advertiser: campaign.advertiser,
    flight: { startDate: campaign.startDate, endDate: campaign.endDate },
    lifecycleStatus: campaign.lifecycleStatus,
    /** Current planning revision (not "live"). */
    currentPlan: currentPlan
      ? {
          id: currentPlan.id,
          name: currentPlan.name,
          status: currentPlan.status,
          updatedAt: currentPlan.updatedAt,
          itemCount: currentPlan.items.length,
        }
      : null,
    /** Inventory commitments from the Atlas booking ledger (not a parallel contract). */
    commitments: campaign.bookings.map((b) => ({
      bookingId: b.id,
      status: b.status,
      executionStatus: b.executionStatus,
      paymentStatus: b.paymentStatus,
      holdExpiresAt: b.expiresAt,
      startDate: b.startDate,
      endDate: b.endDate,
      mediaPlanId: b.mediaPlanId,
      items: b.items.map((item) => ({
        id: item.id,
        inventoryId: item.inventoryId,
        status: item.status,
        slotsConsumed: item.slotsConsumed,
        vendorOrganizationId: item.vendorOrganizationId,
      })),
      recentTransitions: b.transitions,
    })),
    /** Vendor approval is not customer acceptance / e-signature. */
    customerAcceptance: {
      present: false,
      note: "Customer electronic acceptance is not wired; use QuoteRevision acceptance when issued, or document manual acceptance outside this ledger.",
    },
    activation: readiness,
    disclaimer:
      "This summary shows inventory commitments and vendor approval state. It is not a customer signed agreement unless QuoteRevision acceptance exists.",
  };
}
