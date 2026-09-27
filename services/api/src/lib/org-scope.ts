import {
  UserRole,
  canAccessLocation,
  isInternalUser,
  isVendorUser,
  isClientUser,
  organizationIdForNewLocation,
  normalizeUserRole,
  type AuthUser,
  type LocationRecord,
} from "@skyarc/shared";
import { forbidden } from "./errors.js";

export type { AuthUser, LocationRecord };

export function requireOrganization(user: AuthUser): string {
  if (!user.organizationId) {
    throw forbidden("Organization membership required");
  }
  return user.organizationId;
}

export type LocationListScope = "mine" | "discovery" | "all";
export type LocationVisibility = "active" | "hidden" | "all";

function archivedFilter(visibility: LocationVisibility = "active"): Record<string, unknown> {
  if (visibility === "hidden") return { archivedAt: { not: null } };
  if (visibility === "all") return {};
  return { archivedAt: null };
}

/** Prisma-compatible filter for listing locations scoped to the caller. */
export function buildLocationListWhere(
  user: AuthUser,
  scope?: LocationListScope,
  visibility: LocationVisibility = "active"
): Record<string, unknown> {
  const base = archivedFilter(visibility);

  if (isInternalUser(user)) {
    return base;
  }

  const role = normalizeUserRole(user.role);

  if (role === UserRole.FIELD_OPERATOR) {
    if (user.organizationId) {
      return { ...base, organizationId: user.organizationId };
    }
    return { ...base, createdByUserId: user.id };
  }

  if (role === UserRole.VENDOR) {
    const orgId = requireOrganization(user);
    if (scope === "discovery") {
      // Discovery never surfaces other orgs' hidden inventory
      return { archivedAt: null, NOT: { organizationId: orgId } };
    }
    if (scope === "all") {
      return base;
    }
    return { ...base, organizationId: orgId };
  }

  if (isClientUser(user)) {
    // Clients only see live catalog
    return { archivedAt: null };
  }

  return base;
}

export function locationOwnedByUser(user: AuthUser, organizationId: string | null): boolean {
  return !!user.organizationId && organizationId === user.organizationId;
}

export {
  isInternalUser,
  isVendorUser,
  isClientUser,
  canAccessLocation,
  organizationIdForNewLocation,
};
