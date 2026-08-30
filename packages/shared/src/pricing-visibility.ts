import { UserRole } from "./user-role.js";
import { normalizeUserRole, type AuthUser } from "./rbac.js";

export interface InventoryOwnership {
  organizationId: string | null;
}

export function isSuperAdmin(user: Pick<AuthUser, "role">): boolean {
  return normalizeUserRole(user.role) === UserRole.SUPERADMIN;
}

export function isAdminRole(user: Pick<AuthUser, "role">): boolean {
  const role = normalizeUserRole(user.role);
  return role === UserRole.SUPERADMIN || role === UserRole.ADMIN;
}

export function canViewClientPricing(user: Pick<AuthUser, "role">): boolean {
  const role = normalizeUserRole(user.role);
  return (
    role === UserRole.SUPERADMIN ||
    role === UserRole.ADMIN ||
    role === UserRole.MEDIA_PLANNER ||
    role === UserRole.CLIENT_VIEWER
  );
}

export function canViewSkyarcCommercial(user: Pick<AuthUser, "role">): boolean {
  return canViewClientPricing(user);
}

export function ownsInventory(
  user: Pick<AuthUser, "organizationId">,
  inventory: InventoryOwnership
): boolean {
  return (
    !!user.organizationId &&
    !!inventory.organizationId &&
    user.organizationId === inventory.organizationId
  );
}

export function canViewVendorPricing(
  user: Pick<AuthUser, "role" | "organizationId">,
  inventory: InventoryOwnership
): boolean {
  const role = normalizeUserRole(user.role);
  if (
    role === UserRole.SUPERADMIN ||
    role === UserRole.ADMIN ||
    role === UserRole.MEDIA_PLANNER
  ) {
    return true;
  }
  if (role !== UserRole.VENDOR) return false;
  return ownsInventory(user, inventory);
}

export function canRequestPricing(
  user: Pick<AuthUser, "role" | "organizationId">,
  inventory: InventoryOwnership
): boolean {
  const role = normalizeUserRole(user.role);
  if (role !== UserRole.VENDOR) return false;
  return !ownsInventory(user, inventory);
}

/** Strip Skyarc-only fields from org commercial payloads for vendors. */
export function sanitizeOrganizationCommercialForUser<T extends Record<string, unknown>>(
  user: Pick<AuthUser, "role">,
  commercial: T
): Partial<T> {
  if (canViewSkyarcCommercial(user)) return commercial;
  const { skyarcMarginPercent: _s, ...vendorSafe } = commercial;
  return vendorSafe as Partial<T>;
}

export function sanitizeOrgCommercialViewForUser(
  user: Pick<AuthUser, "role">,
  view: Record<string, unknown>
): Record<string, unknown> {
  if (canViewSkyarcCommercial(user)) return view;
  const {
    skyarcMarginPercent: _a,
    effectiveMarginPercent: _b,
    platformDefaultMarginPercent: _c,
    ...rest
  } = view;
  return rest;
}

export function sanitizeLocationCommercialViewForUser(
  user: Pick<AuthUser, "role" | "organizationId">,
  locationOrgId: string | null,
  view: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!view) return undefined;
  const role = normalizeUserRole(user.role);
  if (role === UserRole.VENDOR && locationOrgId !== user.organizationId) {
    return undefined;
  }
  if (canViewClientPricing(user)) return view;
  return view;
}

export function maybeVendorRate<T extends { amount: number }>(
  user: Pick<AuthUser, "role" | "organizationId">,
  inventory: InventoryOwnership,
  rate: T | null | undefined
): T | undefined {
  if (!rate) return undefined;
  if (!canViewVendorPricing(user, inventory)) return undefined;
  return rate;
}
