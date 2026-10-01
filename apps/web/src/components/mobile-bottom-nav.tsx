"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MapPin,
  Map,
  Building2,
  User,
  LayoutDashboard,
  Send,
} from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user, isVendor, canAccessRoute } = usePermissions();

  if (!user || pathname === "/login") return null;

  const navItems = [
    {
      label: "Sites",
      href: "/locations",
      icon: MapPin,
      active: pathname === "/locations" || pathname.startsWith("/locations/"),
      show: true,
    },
    {
      label: "Map",
      href: "/map",
      icon: Map,
      active: pathname === "/map",
      show: true,
    },
    {
      label: isVendor ? "Requests" : "Campaigns",
      href: isVendor ? "/requests" : "/campaigns",
      icon: isVendor ? Send : LayoutDashboard,
      active: isVendor
        ? pathname.startsWith("/requests")
        : pathname.startsWith("/campaigns"),
      show: isVendor ? canAccessRoute("/requests") : canAccessRoute("/campaigns"),
    },
    {
      label: isVendor ? "Agency" : "Vendors",
      href: isVendor ? "/organization" : "/admin/organizations",
      icon: Building2,
      active: isVendor
        ? pathname.startsWith("/organization")
        : pathname.startsWith("/admin/organizations"),
      show: isVendor ? canAccessRoute("/organization") : canAccessRoute("/admin/organizations"),
    },
    {
      label: "Account",
      href: "/account",
      icon: User,
      active: pathname === "/account",
      show: true,
    },
  ].filter((item) => item.show);

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-violet-100/90 bg-white/98 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_24px_rgba(76,29,149,0.08)] backdrop-blur-lg md:hidden"
    >
      <div className="flex h-[3.75rem] items-stretch justify-around px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 transition-all active:scale-95",
                item.active
                  ? "text-primary"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                  item.active && "bg-primary/12"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5",
                    item.active ? "stroke-[2.5]" : "stroke-[2]"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] leading-none tracking-tight",
                  item.active ? "font-bold" : "font-medium"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
