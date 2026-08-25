import { UserRole } from "@skyarc/shared";
import type { AuthUser } from "./rbac.js";
import { forbidden } from "./errors.js";

export interface LocationRecord {
  id: string;
  createdByUserId: string;
  organizationId: string | null;
  archivedAt?: Date | null;
}

/** SkyArc internal roles — full platform access for planning and admin. */
export function isInternalUser(user: AuthUser): boolean {
  return (
    user.role === UserRole.ADMIN ||
    user.role === UserRole.MEDIA_PLANNER ||
    user.role === UserRole.SALES ||
    user.role === UserRole.VIEWER
  );
}

export function isVendorUser(user: AuthUser): boolean {
  return user.role === UserRole.VENDOR_ADMIN;
}

export function isClientUser(user: AuthUser): boolean {
  return user.role === UserRole.CLIENT_VIEWER;
}

export function requireOrganization(user: AuthUser): string {
  if (!user.organizationId) {
    throw forbidden("Organization membership required");
  }
  return user.organizationId;
}

/** Prisma-compatible filter for listing locations scoped to the caller. */
export function buildLocationListWhere(user: AuthUser): {
  archivedAt: null;
  organizationId?: string;
  createdByUserId?: string;
} {
  const base = { archivedAt: null as null };

  if (isInternalUser(user)) {
    return base;
  }

  if (user.role === UserRole.FIELD_OPERATOR) {
    if (user.organizationId) {
      return { ...base, organizationId: user.organizationId };
    }
    return { ...base, createdByUserId: user.id };
  }

  if (user.role === UserRole.VENDOR_ADMIN || user.role === UserRole.VENDOR_OPS) {
    return { ...base, organizationId: requireOrganization(user) };
  }

  if (isClientUser(user)) {
    throw forbidden();
  }

  return base;
}

export function canAccessLocation(user: AuthUser, location: LocationRecord): boolean {
  if (location.archivedAt) {
    return isInternalUser(user);
  }

  if (isInternalUser(user)) {
    return true;
  }

  if (user.role === UserRole.FIELD_OPERATOR) {
    if (user.organizationId) {
      return location.organizationId === user.organizationId;
    }
    return location.createdByUserId === user.id;
  }

  if (user.role === UserRole.VENDOR_ADMIN || user.role === UserRole.VENDOR_OPS) {
    return (
      !!user.organizationId &&
      !!location.organizationId &&
      location.organizationId === user.organizationId
    );
  }

  return false;
}

/** Organization id assigned when a user creates a location. */
export function organizationIdForNewLocation(user: AuthUser): string | undefined {
  if (user.role === UserRole.VENDOR_ADMIN || user.role === UserRole.FIELD_OPERATOR) {
    return requireOrganization(user);
  }
  if (isInternalUser(user)) {
    return user.organizationId ?? undefined;
  }
  return undefined;
}
