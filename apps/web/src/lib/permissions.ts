import {
  UserRole,
  canAccessAdmin,
  canAccessCampaigns,
  canAccessLocations,
  canAccessOrganizationPage,
  canWriteLocation,
  getDefaultLandingPath,
  isReadOnly,
  isVendorRole,
  type AuthUser,
  type LocationRecord,
} from "@skyarc/shared";
import type { StoredUser } from "./api";

export function toAuthUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  };
}

export function canAccessRoute(user: StoredUser | null, pathname: string): boolean {
  if (!user) return false;

  const authUser = toAuthUser(user);

  if (pathname === "/login") return true;

  if (pathname === "/account") {
    return true;
  }

  if (pathname.startsWith("/admin/organizations") && !pathname.match(/^\/admin\/organizations\/[^/]+/)) {
    return canAccessAdmin(authUser);
  }

  if (pathname.startsWith("/admin/settings")) {
    return canAccessAdmin(authUser);
  }

  if (pathname.match(/^\/admin\/organizations\/[^/]+/)) {
    return canAccessAdmin(authUser);
  }

  if (pathname.startsWith("/campaigns")) {
    return canAccessCampaigns(authUser);
  }

  if (pathname === "/dashboard") {
    return canAccessCampaigns(authUser);
  }

  if (pathname.startsWith("/organization")) {
    return canAccessOrganizationPage(authUser);
  }

  if (pathname.startsWith("/locations")) {
    if (!canAccessLocations(authUser)) return false;
    if (pathname.includes("/edit") && isReadOnly(authUser)) return false;
    return true;
  }

  if (pathname.startsWith("/map")) {
    return canAccessLocations(authUser);
  }

  return true;
}

export function canEditLocation(
  user: StoredUser | null,
  location: Pick<LocationRecord, "id" | "createdByUserId" | "organizationId" | "archivedAt">
): boolean {
  if (!user) return false;
  return canWriteLocation(toAuthUser(user), {
    id: location.id,
    createdByUserId: location.createdByUserId,
    organizationId: location.organizationId ?? null,
    archivedAt: location.archivedAt ?? null,
  });
}

export function getLandingPath(user: StoredUser): string {
  return getDefaultLandingPath(user.role);
}

export function isVendorPortalUser(user: StoredUser): boolean {
  return isVendorRole(user.role);
}

export function roleLabel(role: UserRole | string): string {
  if (role === UserRole.CLIENT_VIEWER) return "Brand Customer / Advertiser";
  if (role === UserRole.SUPERADMIN) return "Superadmin";
  if (role === UserRole.ADMIN) return "Admin";
  if (role === UserRole.MEDIA_PLANNER) return "Media Planner";
  if (role === UserRole.FIELD_OPERATOR) return "Field Operator";
  if (role === UserRole.VENDOR) return "Vendor / Media Owner";
  return role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
