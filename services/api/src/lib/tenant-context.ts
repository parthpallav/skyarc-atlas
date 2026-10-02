import type { AuthUser } from "@skyarc/shared";
import { isInternalUser, canAccessLocation, type LocationRecord } from "@skyarc/shared";
import { forbidden } from "./errors.js";

/**
 * Verified tenant context for mutating and sensitive read paths.
 * Organization role alone is insufficient — callers must pass a resolved tenantId
 * that matches the authenticated user's organization (unless internal).
 */
export type TenantContext = {
  userId: string;
  role: string;
  tenantId: string | null;
  isInternal: boolean;
};

export function resolveTenantContext(user: AuthUser): TenantContext {
  return {
    userId: user.id,
    role: user.role,
    tenantId: user.organizationId ?? null,
    isInternal: isInternalUser(user),
  };
}

export function requireTenantId(user: AuthUser): string {
  const tenantId = user.organizationId;
  if (!tenantId && !isInternalUser(user)) {
    throw forbidden("Tenant organization is required");
  }
  if (!tenantId) {
    throw forbidden("Tenant organization is required for this operation");
  }
  return tenantId;
}

/** Assert the user may access a location resource under tenant rules. */
export function assertCanAccessLocation(user: AuthUser, location: LocationRecord): void {
  if (!canAccessLocation(user, location)) {
    throw forbidden();
  }
}
