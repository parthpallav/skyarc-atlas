import type { LucideIcon } from "lucide-react";
import {
  Building2,
  LayoutDashboard,
  Map,
  MapPin,
  Megaphone,
  Settings,
  User,
  Users,
} from "lucide-react";
import { canAccessAdmin, canAccessCampaigns, isVendorRole } from "@skyarc/shared";
import type { StoredUser } from "./api";
import { toAuthUser } from "./permissions";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function getNavLinks(user: StoredUser | null): NavLink[] {
  if (!user) return [];

  const authUser = toAuthUser(user);

  if (isVendorRole(user.role)) {
    return [
      { href: "/locations", label: "My Inventory", icon: MapPin },
      { href: "/organization", label: "My Organization", icon: Building2 },
      { href: "/map", label: "Map", icon: Map },
    ];
  }

  const links: NavLink[] = [];

  if (canAccessCampaigns(authUser)) {
    links.push({ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard });
  }

  links.push({ href: "/locations", label: "Locations", icon: MapPin });

  if (canAccessCampaigns(authUser)) {
    links.push({ href: "/campaigns", label: "Campaigns", icon: Megaphone });
  }

  links.push({ href: "/map", label: "Map", icon: Map });

  if (canAccessAdmin(authUser)) {
    links.push({ href: "/admin/organizations", label: "Vendors", icon: Users });
    links.push({ href: "/admin/settings", label: "Settings", icon: Settings });
  }

  return links;
}
