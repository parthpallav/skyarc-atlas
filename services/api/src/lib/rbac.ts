import { UserRole } from "@skyarc/shared";
import { forbidden } from "./errors.js";
import type { LocationRecord } from "./org-scope.js";
import { canAccessLocation, isInternalUser, isVendorUser } from "./org-scope.js";

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
  organizationId: string | null;
}

const readRoles: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MEDIA_PLANNER,
  UserRole.SALES,
  UserRole.FIELD_OPERATOR,
  UserRole.VIEWER,
  UserRole.VENDOR_ADMIN,
  UserRole.VENDOR_OPS,
];

export function requireRole(user: AuthUser, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) {
    throw forbidden();
  }
}

export function canReadLocations(user: AuthUser): boolean {
  return readRoles.includes(user.role);
}

export function canManageUsers(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN;
}

export function canManageOrganizations(user: AuthUser): boolean {
  return user.role === UserRole.ADMIN;
}

export function canWriteLocation(user: AuthUser, location: LocationRecord): boolean {
  if (user.role === UserRole.VIEWER || user.role === UserRole.CLIENT_VIEWER) {
    return false;
  }

  if (user.role === UserRole.ADMIN) {
    return true;
  }

  if (user.role === UserRole.VENDOR_OPS) {
    return false;
  }

  if (isVendorUser(user)) {
    return canAccessLocation(user, location);
  }

  if (user.role === UserRole.MEDIA_PLANNER || user.role === UserRole.SALES) {
    return true;
  }

  if (user.role === UserRole.FIELD_OPERATOR) {
    return user.id === location.createdByUserId;
  }

  return false;
}

export function isReadOnly(user: AuthUser): boolean {
  return (
    user.role === UserRole.VIEWER ||
    user.role === UserRole.CLIENT_VIEWER ||
    user.role === UserRole.VENDOR_OPS
  );
}

export { isInternalUser, isVendorUser, canAccessLocation };
