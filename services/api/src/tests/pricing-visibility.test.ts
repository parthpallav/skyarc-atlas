import { describe, expect, it } from "vitest";
import {
  UserRole,
  canViewClientPricing,
  canViewVendorPricing,
  sanitizeOrgCommercialViewForUser,
  type AuthUser,
} from "@skyarc/shared";

const vendor: AuthUser = {
  id: "v1",
  email: "vendor@skyarc.in",
  role: UserRole.VENDOR,
  organizationId: "org-a",
};

const planner: AuthUser = {
  id: "p1",
  email: "planner@skyarc.in",
  role: UserRole.MEDIA_PLANNER,
  organizationId: "org-skyarc",
};

describe("pricing visibility", () => {
  it("vendor cannot view client pricing", () => {
    expect(canViewClientPricing(vendor)).toBe(false);
    expect(canViewClientPricing(planner)).toBe(true);
  });

  it("vendor sees own vendor rates only", () => {
    expect(canViewVendorPricing(vendor, { organizationId: "org-a" })).toBe(true);
    expect(canViewVendorPricing(vendor, { organizationId: "org-b" })).toBe(false);
  });

  it("strips Skyarc commercial fields for vendors", () => {
    const view = sanitizeOrgCommercialViewForUser(vendor, {
      defaultMarginPercent: 12,
      effectiveMarginPercent: 18,
      platformDefaultMarginPercent: 15,
      skyarcMarginPercent: 18,
    });
    expect(view.effectiveMarginPercent).toBeUndefined();
    expect(view.platformDefaultMarginPercent).toBeUndefined();
    expect(view.defaultMarginPercent).toBe(12);
  });
});
