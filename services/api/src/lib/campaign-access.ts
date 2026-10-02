import type { AuthUser } from "@skyarc/shared";
import { isClientUser, isInternalUser, isVendorUser } from "@skyarc/shared";
import { prisma } from "./prisma.js";
import { forbidden, notFound } from "./errors.js";

export type CampaignAccessRow = {
  id: string;
  createdByUserId: string | null;
};

/** Pure decision helper — used by routes and unit tests. */
export function decideCampaignAccess(
  user: Pick<AuthUser, "id" | "role" | "organizationId">,
  campaign: { createdByUserId: string | null },
  opts: { vendorHasInventory: boolean } = { vendorHasInventory: false }
): "allow" | "deny" {
  if (isInternalUser(user)) return "allow";
  const owns = campaign.createdByUserId === user.id;
  if (isClientUser(user)) return owns ? "allow" : "deny";
  if (isVendorUser(user)) {
    if (owns) return "allow";
    return opts.vendorHasInventory ? "allow" : "deny";
  }
  return owns ? "allow" : "deny";
}

export async function assertCanAccessCampaign(
  user: AuthUser,
  campaignId: string
): Promise<CampaignAccessRow> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, createdByUserId: true },
  });
  if (!campaign) throw notFound("Campaign not found");

  let vendorHasInventory = false;
  if (isVendorUser(user) && campaign.createdByUserId !== user.id) {
    const inbound = await prisma.mediaPlanItem.findFirst({
      where: {
        mediaPlan: { campaignId },
        inventory: {
          screen: {
            location: { organizationId: user.organizationId ?? "__none__" },
          },
        },
      },
      select: { id: true },
    });
    vendorHasInventory = Boolean(inbound);
  }

  if (decideCampaignAccess(user, campaign, { vendorHasInventory }) === "deny") {
    throw forbidden("Cross-tenant campaign access denied");
  }
  return campaign;
}

export async function assertCanMutateCampaign(
  user: AuthUser,
  campaignId: string
): Promise<CampaignAccessRow> {
  const campaign = await assertCanAccessCampaign(user, campaignId);
  if (isInternalUser(user)) return campaign;
  if (campaign.createdByUserId !== user.id) {
    throw forbidden("Cross-tenant campaign mutation denied");
  }
  return campaign;
}
