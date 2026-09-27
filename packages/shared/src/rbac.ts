import { UserRole } from "./user-role.js";

export interface AuthUser {
  id: string;
  role: UserRole;
  email: string;
  organizationId: string | null;
}

export interface LocationRecord {
  id: string;
  createdByUserId: string;
  organizationId: string | null;
  archivedAt?: Date | null;
}

/** Map legacy DB/JWT roles to the core MVP roles. */
export function normalizeUserRole(role: string): UserRole {
  switch (role) {
    case UserRole.SUPERADMIN:
    case UserRole.ADMIN:
    case UserRole.MEDIA_PLANNER:
    case UserRole.FIELD_OPERATOR:
    case UserRole.VENDOR:
    case UserRole.CLIENT_VIEWER:
      return role as UserRole;
    case UserRole.VENDOR_ADMIN:
    case UserRole.VENDOR_OPS:
      return UserRole.VENDOR;
    case UserRole.SALES:
    case UserRole.VIEWER:
      return UserRole.MEDIA_PLANNER;
    default:
      return UserRole.MEDIA_PLANNER;
  }
}

export function normalizedRole(user: Pick<AuthUser, "role">): UserRole {
  return normalizeUserRole(user.role);
}

/** Skyarc internal roles — planning and admin surfaces. */
export function isInternalUser(user: Pick<AuthUser, "role">): boolean {
  const role = normalizedRole(user);
  return (
    role === UserRole.SUPERADMIN ||
    role === UserRole.ADMIN ||
    role === UserRole.MEDIA_PLANNER
  );
}

export function isVendorUser(user: Pick<AuthUser, "role">): boolean {
  return normalizedRole(user) === UserRole.VENDOR;
}

export function isVendorRole(role: UserRole | string): boolean {
  return normalizeUserRole(role) === UserRole.VENDOR;
}

export function isClientUser(user: Pick<AuthUser, "role">): boolean {
  return normalizedRole(user) === UserRole.CLIENT_VIEWER;
}

export function isReadOnly(user: Pick<AuthUser, "role">): boolean {
  return (
    user.role === UserRole.VIEWER ||
    user.role === UserRole.VENDOR_OPS ||
    user.role === UserRole.CLIENT_VIEWER
  );
}

export function canAccessCampaigns(user: Pick<AuthUser, "role">): boolean {
  return isInternalUser(user) || isClientUser(user) || isVendorUser(user);
}

/**
 * Internal planners, brand clients, and vendors can create campaigns.
 * Vendors use this for network inventory requests (not full media planning).
 * Location writes stay blocked for clients. Vendor ops stays read-only.
 */
export function canWriteCampaigns(user: Pick<AuthUser, "role">): boolean {
  if (isReadOnly(user) && !isClientUser(user)) return false;
  return isInternalUser(user) || isClientUser(user) || isVendorUser(user);
}

/** Superadmin, admin, or media planner may approve a full site request. */
export function canApproveMediaPlan(user: Pick<AuthUser, "role">): boolean {
  return isInternalUser(user);
}

/** Skyarc planner/admin may mark a campaign ready so brand can request sites from owners. */
export function canMarkCampaignReadyForSiteRequests(user: Pick<AuthUser, "role">): boolean {
  return isInternalUser(user);
}

/**
 * Who may create/send site requests to media owners.
 * Clients only after Skyarc set readyForSiteRequestsAt; internals always; vendors never (they respond).
 */
export function canSendSiteRequestsToOwners(
  user: Pick<AuthUser, "role">,
  campaign: { readyForSiteRequestsAt?: Date | string | null }
): boolean {
  if (isVendorUser(user)) return false;
  if (isInternalUser(user)) return true;
  if (!isClientUser(user)) return false;
  return Boolean(campaign.readyForSiteRequestsAt);
}

/** Vendors (non read-only) may approve/reject requests that include their inventory. */
export function canRespondToSiteRequest(user: Pick<AuthUser, "role">): boolean {
  return isVendorUser(user) && !isReadOnly(user);
}

export function canMutateCampaign(
  user: Pick<AuthUser, "id" | "role">,
  campaign: { createdByUserId?: string | null }
): boolean {
  if (normalizedRole(user) === UserRole.SUPERADMIN) return true;
  if (isInternalUser(user)) return true;
  return Boolean(campaign.createdByUserId) && campaign.createdByUserId === user.id;
}

export function canAccessAdmin(user: Pick<AuthUser, "role">): boolean {
  const role = normalizedRole(user);
  return role === UserRole.SUPERADMIN || role === UserRole.ADMIN;
}

export function canAccessLocations(user: Pick<AuthUser, "role">): boolean {
  const role = normalizedRole(user);
  return (
    isInternalUser(user) ||
    role === UserRole.VENDOR ||
    role === UserRole.FIELD_OPERATOR ||
    role === UserRole.CLIENT_VIEWER
  );
}

export function canAccessOrganizationPage(user: Pick<AuthUser, "role">): boolean {
  return canAccessAdmin(user) || isVendorRole(user.role);
}

export function canAccessLocation(user: AuthUser, location: LocationRecord): boolean {
  if (location.archivedAt) {
    // Hidden sites: internals, or the owning vendor org (so they can restore)
    if (isInternalUser(user)) return true;
    if (
      isVendorRole(user.role) &&
      !!user.organizationId &&
      location.organizationId === user.organizationId
    ) {
      return true;
    }
    return false;
  }

  if (isInternalUser(user) || isClientUser(user)) {
    return true;
  }

  const role = normalizedRole(user);

  if (role === UserRole.FIELD_OPERATOR) {
    if (user.organizationId) {
      return location.organizationId === user.organizationId;
    }
    return location.createdByUserId === user.id;
  }

  if (role === UserRole.VENDOR) {
    return true;
  }

  return false;
}

export function canWriteLocation(user: AuthUser, location: LocationRecord): boolean {
  if (isReadOnly(user)) {
    return false;
  }

  const role = normalizedRole(user);

  if (role === UserRole.SUPERADMIN || role === UserRole.ADMIN) {
    return true;
  }

  if (role === UserRole.VENDOR) {
    return (
      !!user.organizationId &&
      !!location.organizationId &&
      location.organizationId === user.organizationId
    );
  }

  if (role === UserRole.MEDIA_PLANNER) {
    return true;
  }

  if (role === UserRole.FIELD_OPERATOR) {
    return user.id === location.createdByUserId;
  }

  return false;
}

export function organizationIdForNewLocation(user: AuthUser): string | undefined {
  const role = normalizedRole(user);
  if (role === UserRole.VENDOR || role === UserRole.FIELD_OPERATOR) {
    return user.organizationId ?? undefined;
  }
  if (isInternalUser(user)) {
    return user.organizationId ?? undefined;
  }
  return undefined;
}

export function getDefaultLandingPath(role: UserRole | string): string {
  const normalized = normalizeUserRole(role);
  if (
    normalized === UserRole.SUPERADMIN ||
    normalized === UserRole.ADMIN ||
    normalized === UserRole.MEDIA_PLANNER
  ) {
    return "/dashboard";
  }
  if (normalized === UserRole.CLIENT_VIEWER) {
    return "/campaigns";
  }
  if (normalized === UserRole.VENDOR || normalized === UserRole.FIELD_OPERATOR) {
    return "/locations";
  }
  return "/login";
}
