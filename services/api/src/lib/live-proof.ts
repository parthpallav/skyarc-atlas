import {
  UserRole,
  canAccessLocation,
  canWriteLocation,
  isClientUser,
  isInternalUser,
  isReadOnly,
  isVendorUser,
  normalizedRole,
  type AuthUser,
  type LocationRecord,
} from "@skyarc/shared";
import { prisma } from "./prisma.js";
import { forbidden, validationError } from "./errors.js";
import { journeyGapsEnabled } from "./journey-gaps.js";

export type LiveProofCampaignRow = {
  id: string;
  name: string;
  advertiserName: string;
  startDate: string | null;
  endDate: string | null;
};

/** ACTIVE campaign that includes this location on an APPROVED plan. */
export async function findActiveCampaignOnLocation(
  locationId: string,
  campaignId: string
): Promise<LiveProofCampaignRow | null> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      lifecycleStatus: "ACTIVE",
      mediaPlans: {
        some: {
          status: "APPROVED",
          items: {
            some: {
              inventory: { screen: { locationId } },
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      advertiser: { select: { name: true } },
    },
  });
  if (!campaign) return null;
  return {
    id: campaign.id,
    name: campaign.name,
    advertiserName: campaign.advertiser.name,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
  };
}

export async function listLiveProofTargetCampaigns(
  locationId: string
): Promise<LiveProofCampaignRow[]> {
  const campaigns = await prisma.campaign.findMany({
    where: {
      lifecycleStatus: "ACTIVE",
      mediaPlans: {
        some: {
          status: "APPROVED",
          items: {
            some: {
              inventory: { screen: { locationId } },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      advertiser: { select: { name: true } },
    },
  });
  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    advertiserName: c.advertiser.name,
    startDate: c.startDate?.toISOString() ?? null,
    endDate: c.endDate?.toISOString() ?? null,
  }));
}

/**
 * Who may upload/confirm/delete CAMPAIGN_LIVE_PROOF:
 * writers on the site, or FO/vendor/internal with location access —
 * always requires ACTIVE campaign that includes the site (P-08).
 */
export async function assertCanMutateLiveProof(
  user: AuthUser,
  location: LocationRecord,
  campaignId: string
): Promise<LiveProofCampaignRow> {
  if (!journeyGapsEnabled()) {
    if (!canWriteLocation(user, location) || isReadOnly(user)) {
      throw forbidden();
    }
    return {
      id: campaignId,
      name: "",
      advertiserName: "",
      startDate: null,
      endDate: null,
    };
  }
  if (isReadOnly(user) || isClientUser(user)) {
    throw forbidden();
  }
  if (!canAccessLocation(user, location)) {
    throw forbidden();
  }

  const campaign = await findActiveCampaignOnLocation(location.id, campaignId);
  if (!campaign) {
    throw validationError(
      "Live proof requires an ACTIVE campaign that includes this site on the current plan"
    );
  }

  if (canWriteLocation(user, location)) {
    return campaign;
  }

  const role = normalizedRole(user);
  const isFieldOperator = role === UserRole.FIELD_OPERATOR;
  if (isFieldOperator || isVendorUser(user) || isInternalUser(user)) {
    return campaign;
  }

  throw forbidden();
}

export function canOfferLiveProofUpload(
  user: AuthUser,
  location: LocationRecord
): boolean {
  if (isReadOnly(user) || isClientUser(user)) return false;
  if (!canAccessLocation(user, location)) return false;
  if (canWriteLocation(user, location)) return true;
  const role = normalizedRole(user);
  return (
    role === UserRole.FIELD_OPERATOR ||
    isVendorUser(user) ||
    isInternalUser(user)
  );
}
