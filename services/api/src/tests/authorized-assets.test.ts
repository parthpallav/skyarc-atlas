import { describe, expect, it } from "vitest";
import {
  assertAssetUploaded,
  evaluateCreativeAssetAccess,
  evaluateProofAssetAccess,
  type LocationAssetRow,
} from "../lib/ops/authorized-assets.js";

const baseAsset = (over: Partial<LocationAssetRow> = {}): LocationAssetRow => ({
  id: "asset-1",
  locationId: "loc-1",
  campaignId: "camp-1",
  kind: "CAMPAIGN_LIVE_PROOF",
  r2Key: "locations/site/views/front.webp",
  contentType: "image/jpeg",
  byteSize: 1200,
  width: 100,
  height: 100,
  durationMs: null,
  checksumSha256: "abc",
  uploadStatus: "UPLOADED",
  confirmedAt: new Date(),
  ...over,
});

describe("authorized assets — forged keys and unauthorized refs", () => {
  it("rejects pending uploads and path-traversal keys", () => {
    expect(assertAssetUploaded(baseAsset({ uploadStatus: "PENDING" }))).toMatch(/not complete/);
    expect(assertAssetUploaded(baseAsset({ r2Key: "../secret" }))).toMatch(/invalid/);
  });

  it("rejects proof asset bound to another campaign", () => {
    const r = evaluateProofAssetAccess({
      asset: baseAsset({ campaignId: "other-camp" }),
      campaignId: "camp-1",
      locationId: "loc-1",
      canWriteLocation: true,
      canMutateCampaign: true,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects proof when location mismatch or booking item off-campaign", () => {
    expect(
      evaluateProofAssetAccess({
        asset: baseAsset(),
        campaignId: "camp-1",
        locationId: "loc-2",
        canWriteLocation: true,
        canMutateCampaign: true,
      }).ok
    ).toBe(false);

    const badItem = evaluateProofAssetAccess({
      asset: baseAsset(),
      campaignId: "camp-1",
      locationId: "loc-1",
      requestedBookingItemId: "bi-1",
      bookingItemCampaignId: "other",
      bookingItemLocationId: "loc-1",
      canWriteLocation: true,
      canMutateCampaign: true,
    });
    expect(badItem.ok).toBe(false);
  });

  it("rejects creative when location write denied or booking items mismatch", () => {
    expect(
      evaluateCreativeAssetAccess({
        asset: baseAsset({ kind: "PHOTO", campaignId: null }),
        campaignId: "camp-1",
        canWriteLocation: false,
        canMutateCampaign: true,
      }).ok
    ).toBe(false);

    expect(
      evaluateCreativeAssetAccess({
        asset: baseAsset({ kind: "PHOTO" }),
        campaignId: "camp-1",
        canWriteLocation: true,
        canMutateCampaign: true,
        bookingItemIds: ["bi-1"],
        bookingItemsOnCampaign: false,
        bookingItemsMatchLocation: true,
      }).ok
    ).toBe(false);
  });

  it("allows authorized proof and creative attachments", () => {
    expect(
      evaluateProofAssetAccess({
        asset: baseAsset(),
        campaignId: "camp-1",
        locationId: "loc-1",
        requestedBookingItemId: "bi-1",
        bookingItemCampaignId: "camp-1",
        bookingItemLocationId: "loc-1",
        taskCampaignId: "camp-1",
        taskBookingItemId: "bi-1",
        canWriteLocation: true,
        canMutateCampaign: true,
      }).ok
    ).toBe(true);

    expect(
      evaluateCreativeAssetAccess({
        asset: baseAsset({ kind: "PHOTO", campaignId: "camp-1" }),
        campaignId: "camp-1",
        canWriteLocation: true,
        canMutateCampaign: true,
        bookingItemIds: ["bi-1"],
        bookingItemsOnCampaign: true,
        bookingItemsMatchLocation: true,
      }).ok
    ).toBe(true);
  });

  it("never accepts raw client r2Key as ownership — asset record required", () => {
    // API contract: create creative body no longer accepts r2Key; ownership is via locationAssetId.
    const forgedKey = "campaigns/other-tenant/secret.bin";
    expect(assertAssetUploaded(baseAsset({ r2Key: forgedKey, uploadStatus: "PENDING" }))).toBeTruthy();
    expect(
      evaluateCreativeAssetAccess({
        asset: baseAsset({
          kind: "PHOTO",
          campaignId: "camp-evil",
          r2Key: forgedKey,
          uploadStatus: "UPLOADED",
        }),
        campaignId: "camp-1",
        canWriteLocation: true,
        canMutateCampaign: true,
      }).ok
    ).toBe(false);
  });
});
