import type { LucideIcon } from "lucide-react";
import {
  Building2,
  LayoutDashboard,
  Map,
  MapPin,
  Megaphone,
  Layers,
  CalendarCheck,
  Send,
  Lightbulb,
  Settings,
  Users,
} from "lucide-react";
import { canAccessAdmin, canAccessCampaigns, isInternalUser, isVendorRole } from "@skyarc/shared";
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
      { href: "/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/requests", label: "Requests", icon: Send },
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
    links.push({ href: "/bookings", label: "Bookings", icon: CalendarCheck });
    links.push({ href: "/requests", label: "Requests", icon: Send });
    links.push({ href: "/media-plans", label: "Media Plans", icon: Layers });
  }

  if (isInternalUser(authUser)) {
    links.push({ href: "/recommendations", label: "Recommendations", icon: Lightbulb });
  }

  links.push({ href: "/map", label: "Map", icon: Map });

  if (canAccessAdmin(authUser)) {
    links.push({ href: "/admin/organizations", label: "Vendors", icon: Users });
    links.push({ href: "/admin/settings", label: "Settings", icon: Settings });
  }

  return links;
}
