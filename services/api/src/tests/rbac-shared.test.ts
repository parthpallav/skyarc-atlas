import {
  UserRole,
  canAccessCampaigns,
  canAccessLocation,
  canWriteLocation,
  getDefaultLandingPath,
  isInternalUser,
  isReadOnly,
  isVendorRole,
  type AuthUser,
} from "@skyarc/shared";
import { describe, expect, it } from "vitest";

const vendorA: AuthUser = {
  id: "vendor-1",
  email: "vendor@example.com",
  role: UserRole.VENDOR_ADMIN,
  organizationId: "org-a",
};

describe("shared rbac", () => {
  it("internal roles land on dashboard", () => {
    expect(getDefaultLandingPath(UserRole.ADMIN)).toBe("/dashboard");
    expect(getDefaultLandingPath(UserRole.MEDIA_PLANNER)).toBe("/dashboard");
  });

  it("vendor roles land on locations", () => {
    expect(getDefaultLandingPath(UserRole.VENDOR_ADMIN)).toBe("/locations");
    expect(getDefaultLandingPath(UserRole.VENDOR_OPS)).toBe("/locations");
  });

  it("vendor cannot access campaigns in UI rules", () => {
    expect(canAccessCampaigns(vendorA)).toBe(false);
    expect(isInternalUser(vendorA)).toBe(false);
    expect(isVendorRole(vendorA.role)).toBe(true);
  });

  it("vendor ops is read-only", () => {
    const ops: AuthUser = { ...vendorA, role: UserRole.VENDOR_OPS };
    expect(isReadOnly(ops)).toBe(true);
    expect(
      canWriteLocation(ops, {
        id: "loc-1",
        createdByUserId: "vendor-1",
        organizationId: "org-a",
      })
    ).toBe(false);
  });

  it("vendor can browse other vendor locations for discovery", () => {
    const own = {
      id: "loc-1",
      createdByUserId: "vendor-1",
      organizationId: "org-a",
    };
    const other = {
      id: "loc-2",
      createdByUserId: "vendor-2",
      organizationId: "org-b",
    };
    expect(canAccessLocation(vendorA, other)).toBe(true);
    expect(canAccessLocation(vendorA, own)).toBe(true);
  });

  it("vendor cannot write other vendor locations", () => {
    expect(
      canWriteLocation(vendorA, {
        id: "loc-2",
        createdByUserId: "vendor-2",
        organizationId: "org-b",
      })
    ).toBe(false);
  });
});
