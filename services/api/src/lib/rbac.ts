import { UserRole, normalizeUserRole } from "@skyarc/shared";
import {
  canAccessLocation,
  canWriteLocation,
  isInternalUser,
  isReadOnly,
  isVendorUser,
  type AuthUser,
  type LocationRecord,
} from "@skyarc/shared";
import { forbidden } from "./errors.js";

export type { AuthUser, LocationRecord };

const readRoles: string[] = [
  UserRole.SUPERADMIN,
  UserRole.ADMIN,
  UserRole.MEDIA_PLANNER,
  UserRole.FIELD_OPERATOR,
  UserRole.VENDOR,
  UserRole.SALES,
  UserRole.VIEWER,
  UserRole.VENDOR_ADMIN,
  UserRole.VENDOR_OPS,
];

export function requireRole(user: AuthUser, allowed: UserRole[]): void {
  const normalized = normalizeUserRole(user.role);
  const allowedNormalized = allowed.map((r) => normalizeUserRole(r));
  if (!allowedNormalized.includes(normalized)) {
    throw forbidden();
  }
}

export function canReadLocations(user: AuthUser): boolean {
  return readRoles.includes(user.role) || readRoles.includes(normalizeUserRole(user.role));
}

export function canManageUsers(user: AuthUser): boolean {
  const role = normalizeUserRole(user.role);
  return role === UserRole.SUPERADMIN || role === UserRole.ADMIN;
}

export function canManageOrganizations(user: AuthUser): boolean {
  return canManageUsers(user);
}

export { canAccessLocation, canWriteLocation, isInternalUser, isReadOnly, isVendorUser };
