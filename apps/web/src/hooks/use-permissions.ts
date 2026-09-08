import {
  isReadOnly,
  canViewClientPricing,
  isClientUser,
  isInternalUser,
  canWriteCampaigns,
  canMutateCampaign,
} from "@skyarc/shared";
import { useAuth } from "@/hooks/use-auth";
import {
  canAccessRoute,
  canEditLocation,
  getLandingPath,
  isVendorPortalUser,
  roleLabel,
  toAuthUser,
} from "@/lib/permissions";

export function usePermissions() {
  const { user } = useAuth();
  const authUser = user ? toAuthUser(user) : null;

  return {
    user,
    authUser,
    isAuthenticated: Boolean(user),
    isReadOnly: authUser ? isReadOnly(authUser) : true,
    isVendor: user ? isVendorPortalUser(user) : false,
    isClient: authUser ? isClientUser(authUser) : false,
    isInternal: authUser ? isInternalUser(authUser) : false,
    canWriteCampaigns: authUser ? canWriteCampaigns(authUser) : false,
    canMutateCampaign: (campaign: { createdByUserId?: string | null }) =>
      authUser ? canMutateCampaign(authUser, campaign) : false,
    canViewClientPricing: authUser ? canViewClientPricing(authUser) : false,
    roleLabel: user ? roleLabel(user.role) : "",
    canAccessRoute: (pathname: string) => canAccessRoute(user, pathname),
    landingPath: user ? getLandingPath(user) : "/login",
    canEditLocation: (
      location: Parameters<typeof canEditLocation>[1]
    ) => canEditLocation(user, location),
  };
}
