import { describe, expect, it } from "vitest";
import { UserRole } from "@skyarc/shared";
import type { AuthUser } from "../lib/rbac.js";
import {
  buildLocationListWhere,
  canAccessLocation,
  organizationIdForNewLocation,
} from "../lib/org-scope.js";
import { canWriteLocation } from "../lib/rbac.js";

const admin: AuthUser = {
  id: "admin-1",
  email: "admin@skyarc.in",
  role: UserRole.ADMIN,
  organizationId: "org-skyarc",
};

const vendorA: AuthUser = {
  id: "vendor-1",
  email: "vendor@example.com",
  role: UserRole.VENDOR_ADMIN,
  organizationId: "org-vendor-a",
};

const vendorB: AuthUser = {
  id: "vendor-2",
  email: "other@example.com",
  role: UserRole.VENDOR_ADMIN,
  organizationId: "org-vendor-b",
};

const locationA = {
  id: "loc-1",
  createdByUserId: "vendor-1",
  organizationId: "org-vendor-a",
};

const locationB = {
  id: "loc-2",
  createdByUserId: "vendor-2",
  organizationId: "org-vendor-b",
};

describe("organization scoping", () => {
  it("internal admin sees all locations in list filter", () => {
    expect(buildLocationListWhere(admin)).toEqual({ archivedAt: null });
  });

  it("vendor list filter is scoped to organization", () => {
    expect(buildLocationListWhere(vendorA)).toEqual({
      archivedAt: null,
      organizationId: "org-vendor-a",
    });
  });

  it("vendor cannot access another vendor location", () => {
    expect(canAccessLocation(vendorA, locationB)).toBe(false);
    expect(canAccessLocation(vendorA, locationA)).toBe(true);
  });

  it("admin can access any location", () => {
    expect(canAccessLocation(admin, locationB)).toBe(true);
  });

  it("vendor can write only own organization locations", () => {
    expect(canWriteLocation(vendorA, locationA)).toBe(true);
    expect(canWriteLocation(vendorA, locationB)).toBe(false);
  });

  it("vendor ops is read-only", () => {
    const vendorOps: AuthUser = {
      ...vendorA,
      role: UserRole.VENDOR_OPS,
    };
    expect(canWriteLocation(vendorOps, locationA)).toBe(false);
  });

  it("new vendor locations inherit organization id", () => {
    expect(organizationIdForNewLocation(vendorA)).toBe("org-vendor-a");
  });

  it("client viewer cannot list locations", () => {
    const client: AuthUser = {
      id: "client-1",
      email: "client@brand.com",
      role: UserRole.CLIENT_VIEWER,
      organizationId: "org-client",
    };
    expect(() => buildLocationListWhere(client)).toThrow();
  });
});
