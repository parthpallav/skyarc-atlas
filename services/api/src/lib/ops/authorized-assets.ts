/**
 * Server-owned asset authorization for creatives and proof.
 * Never trust a client-supplied r2Key as proof of ownership.
 */
import type { AuthUser } from "@skyarc/shared";
import { isInternalUser } from "@skyarc/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import { canWriteLocation } from "../rbac.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type LocationAssetRow = {
  id: string;
  locationId: string;
  campaignId: string | null;
  kind: string;
  r2Key: string;
  contentType: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  checksumSha256: string | null;
  uploadStatus: string;
  confirmedAt: Date | null;
};

const CREATIVE_KINDS = new Set(["PHOTO", "OTHER", "CAMPAIGN_LIVE_PROOF"]);
const PROOF_KINDS = new Set(["PHOTO", "CAMPAIGN_LIVE_PROOF", "OTHER"]);

export function assertAssetUploaded(asset: LocationAssetRow): string | null {
  if (asset.uploadStatus !== "UPLOADED") {
    return "Referenced asset upload is not complete";
  }
  if (!asset.r2Key || asset.r2Key.includes("..")) {
    return "Referenced asset storage key is invalid";
  }
  return null;
}

/**
 * Pure checks used by unit tests for forged / unauthorized references.
 */
export function evaluateProofAssetAccess(input: {
  asset: LocationAssetRow;
  campaignId: string;
  locationId: string;
  bookingItemLocationId?: string | null;
  bookingItemCampaignId?: string | null;
  taskCampaignId?: string | null;
  taskBookingItemId?: string | null;
  requestedBookingItemId?: string | null;
  canWriteLocation: boolean;
  canMutateCampaign: boolean;
}): { ok: true } | { ok: false; error: string } {
  const uploaded = assertAssetUploaded(input.asset);
  if (uploaded) return { ok: false, error: uploaded };
  if (input.asset.locationId !== input.locationId) {
    return { ok: false, error: "Asset does not belong to the stated location" };
  }
  if (!PROOF_KINDS.has(input.asset.kind)) {
    return { ok: false, error: "Asset kind is not allowed for proof" };
  }
  // Campaign-bound proof assets must match campaign
  if (input.asset.campaignId && input.asset.campaignId !== input.campaignId) {
    return { ok: false, error: "Asset is bound to a different campaign" };
  }
  if (input.asset.kind === "CAMPAIGN_LIVE_PROOF" && input.asset.campaignId !== input.campaignId) {
    return { ok: false, error: "Live proof asset must be bound to this campaign" };
  }
  if (!input.canMutateCampaign && !input.canWriteLocation) {
    return { ok: false, error: "Not authorized to attach assets for this campaign/location" };
  }
  if (input.requestedBookingItemId) {
    if (input.bookingItemCampaignId !== input.campaignId) {
      return { ok: false, error: "Booking item is not on this campaign" };
    }
    if (input.bookingItemLocationId && input.bookingItemLocationId !== input.locationId) {
      return { ok: false, error: "Booking item location does not match proof location" };
    }
  }
  if (input.taskCampaignId != null && input.taskCampaignId !== input.campaignId) {
    return { ok: false, error: "Execution task is not on this campaign" };
  }
  if (
    input.requestedBookingItemId &&
    input.taskBookingItemId &&
    input.taskBookingItemId !== input.requestedBookingItemId
  ) {
    return { ok: false, error: "Execution task is not linked to the booking item" };
  }
  return { ok: true };
}

export function evaluateCreativeAssetAccess(input: {
  asset: LocationAssetRow;
  campaignId: string;
  canWriteLocation: boolean;
  canMutateCampaign: boolean;
  bookingItemIds?: string[];
  bookingItemsOnCampaign?: boolean;
  bookingItemsMatchLocation?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const uploaded = assertAssetUploaded(input.asset);
  if (uploaded) return { ok: false, error: uploaded };
  if (!CREATIVE_KINDS.has(input.asset.kind)) {
    return { ok: false, error: "Asset kind is not allowed for creative" };
  }
  if (input.asset.campaignId && input.asset.campaignId !== input.campaignId) {
    return { ok: false, error: "Creative asset is bound to a different campaign" };
  }
  if (!input.canMutateCampaign) {
    return { ok: false, error: "Not authorized to attach creative for this campaign" };
  }
  if (!input.canWriteLocation) {
    return { ok: false, error: "Not authorized to use assets from this location" };
  }
  if (input.bookingItemIds?.length) {
    if (!input.bookingItemsOnCampaign) {
      return { ok: false, error: "Booking items are not on this campaign" };
    }
    if (input.bookingItemsMatchLocation === false) {
      return { ok: false, error: "Booking items are not at the asset location" };
    }
  }
  return { ok: true };
}

export async function resolveAuthorizedProofAsset(
  db: Db,
  user: AuthUser,
  input: {
    campaignId: string;
    locationId: string;
    locationAssetId: string;
    bookingItemId?: string | null;
    executionTaskId?: string | null;
  }
): Promise<{ ok: true; asset: LocationAssetRow } | { ok: false; error: string }> {
  const asset = await db.locationAsset.findUnique({ where: { id: input.locationAssetId } });
  if (!asset) return { ok: false, error: "Location asset not found" };

  const location = await db.location.findUnique({ where: { id: input.locationId } });
  if (!location) return { ok: false, error: "Location not found" };

  let bookingItemLocationId: string | null = null;
  let bookingItemCampaignId: string | null = null;
  if (input.bookingItemId) {
    const item = await db.bookingItem.findUnique({
      where: { id: input.bookingItemId },
      include: {
        booking: { select: { campaignId: true } },
        inventory: { include: { screen: { select: { locationId: true } } } },
      },
    });
    if (!item) return { ok: false, error: "Booking item not found" };
    bookingItemCampaignId = item.booking.campaignId;
    bookingItemLocationId = item.inventory.screen.locationId;
  }

  let taskCampaignId: string | null = null;
  let taskBookingItemId: string | null = null;
  if (input.executionTaskId) {
    const task = await db.executionTask.findUnique({
      where: { id: input.executionTaskId },
      select: { campaignId: true, bookingItemId: true },
    });
    if (!task) return { ok: false, error: "Execution task not found" };
    taskCampaignId = task.campaignId;
    taskBookingItemId = task.bookingItemId;
  }

  const decision = evaluateProofAssetAccess({
    asset,
    campaignId: input.campaignId,
    locationId: input.locationId,
    bookingItemLocationId,
    bookingItemCampaignId,
    taskCampaignId,
    taskBookingItemId,
    requestedBookingItemId: input.bookingItemId ?? null,
    canWriteLocation: canWriteLocation(user, location) || isInternalUser(user),
    canMutateCampaign: true, // caller already asserted mutate
  });
  if (!decision.ok) return decision;
  return { ok: true, asset };
}

export async function resolveAuthorizedCreativeAsset(
  db: Db,
  user: AuthUser,
  input: {
    campaignId: string;
    locationAssetId: string;
    bookingItemIds?: string[];
  }
): Promise<{ ok: true; asset: LocationAssetRow } | { ok: false; error: string }> {
  const asset = await db.locationAsset.findUnique({ where: { id: input.locationAssetId } });
  if (!asset) return { ok: false, error: "Location asset not found" };

  const location = await db.location.findUnique({ where: { id: asset.locationId } });
  if (!location) return { ok: false, error: "Location not found" };

  let bookingItemsOnCampaign = true;
  let bookingItemsMatchLocation = true;
  if (input.bookingItemIds?.length) {
    const items = await db.bookingItem.findMany({
      where: { id: { in: input.bookingItemIds } },
      include: {
        booking: { select: { campaignId: true } },
        inventory: { include: { screen: { select: { locationId: true } } } },
      },
    });
    if (items.length !== input.bookingItemIds.length) {
      return { ok: false, error: "One or more booking items were not found" };
    }
    bookingItemsOnCampaign = items.every((i: { booking: { campaignId: string } }) => i.booking.campaignId === input.campaignId);
    bookingItemsMatchLocation = items.every(
      (i: { inventory: { screen: { locationId: string } } }) => i.inventory.screen.locationId === asset.locationId
    );
  }

  const decision = evaluateCreativeAssetAccess({
    asset,
    campaignId: input.campaignId,
    canWriteLocation: canWriteLocation(user, location) || isInternalUser(user),
    canMutateCampaign: true,
    bookingItemIds: input.bookingItemIds,
    bookingItemsOnCampaign,
    bookingItemsMatchLocation,
  });
  if (!decision.ok) return decision;
  return { ok: true, asset };
}

/** Bind asset to campaign after creative/proof attachment when unbound. */
export async function bindAssetToCampaign(
  db: Db,
  assetId: string,
  campaignId: string
): Promise<void> {
  await db.locationAsset.updateMany({
    where: { id: assetId, campaignId: null },
    data: { campaignId, updatedAt: new Date() },
  });
}

export type { PrismaClient };
