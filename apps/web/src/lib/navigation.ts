import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarCheck2,
  LayoutDashboard,
  Map,
  MapPin,
  Megaphone,
  Layers,
  Send,
  Settings,
  Users,
} from "lucide-react";
import {
  canAccessAdmin,
  canAccessCampaigns,
  isClientUser,
  isVendorRole,
} from "@skyarc/shared";
import type { StoredUser } from "./api";
import { toAuthUser } from "./permissions";
import { showAdtechBooking } from "./feature-flags";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function getNavLinks(user: StoredUser | null): NavLink[] {
  if (!user) return [];

  const authUser = toAuthUser(user);
  const adtech = showAdtechBooking();

  // Media Owners (Vendors)
  if (isVendorRole(user.role)) {
    return [
      { href: "/locations", label: "My Inventory", icon: MapPin },
      { href: "/requests", label: "Requests", icon: Send },
      ...(adtech ? [{ href: "/bookings", label: "Bookings", icon: CalendarCheck2 } as NavLink] : []),
      { href: "/organization", label: "My Organization", icon: Building2 },
      { href: "/map", label: "Map", icon: Map },
    ];
  }

  // Brand Customers (Clients) — focused on campaigns and site exploration
  if (isClientUser(authUser)) {
    return [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/locations", label: "Browse Sites", icon: MapPin },
      { href: "/requests", label: "Requests", icon: Send },
      { href: "/map", label: "Map", icon: Map },
    ];
  }

  // Planners and Admins — streamlined primary workflow (<= 7 items)
  const links: NavLink[] = [];

  if (canAccessCampaigns(authUser)) {
    links.push({ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard });
  }

  links.push({ href: "/locations", label: "Locations", icon: MapPin });

  if (canAccessCampaigns(authUser)) {
    links.push({ href: "/campaigns", label: "Campaigns", icon: Megaphone });
    links.push({ href: "/requests", label: "Approvals", icon: Send });
    if (adtech) {
      links.push({ href: "/bookings", label: "Bookings", icon: CalendarCheck2 });
    }
  }

  links.push({ href: "/map", label: "Map", icon: Map });

  if (canAccessAdmin(authUser)) {
    links.push({ href: "/admin/organizations", label: "Organizations", icon: Users });
    links.push({ href: "/admin/settings", label: "Settings", icon: Settings });
  }

  return links;
}
