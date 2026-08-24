import { UserRole } from "@skyarc/shared";
import { forbidden } from "./errors.js";

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
}

const readRoles: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MEDIA_PLANNER,
  UserRole.SALES,
  UserRole.FIELD_OPERATOR,
  UserRole.VIEWER,
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

export function canWriteLocation(
  user: AuthUser,
  createdByUserId: string
): boolean {
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.FIELD_OPERATOR) {
    return user.id === createdByUserId;
  }
  if (user.role === UserRole.MEDIA_PLANNER || user.role === UserRole.SALES) {
    return true;
  }
  return false;
}

export function isReadOnly(user: AuthUser): boolean {
  return user.role === UserRole.VIEWER;
}
