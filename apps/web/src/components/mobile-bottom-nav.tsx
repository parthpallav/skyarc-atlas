"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MapPin,
  Map,
  Layers,
  Building2,
  User,
  LayoutDashboard,
  PlusCircle,
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
      label: isVendor ? "Agency" : "Campaigns",
      href: isVendor ? "/organization" : "/campaigns",
      icon: isVendor ? Building2 : Layers,
      active: isVendor
        ? pathname.startsWith("/organization")
        : pathname.startsWith("/campaigns"),
      show: isVendor ? canAccessRoute("/organization") : canAccessRoute("/campaigns"),
    },
    {
      label: isVendor ? "Dashboard" : "Vendors",
      href: isVendor ? "/dashboard" : "/admin/organizations",
      icon: isVendor ? LayoutDashboard : Building2,
      active: isVendor
        ? pathname === "/dashboard"
        : pathname.startsWith("/admin/organizations"),
      show: isVendor ? canAccessRoute("/dashboard") : canAccessRoute("/admin/organizations"),
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
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="flex items-center justify-around h-14 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all active:scale-90",
                item.active
                  ? "text-primary font-bold"
                  : "text-slate-500 hover:text-slate-900 font-medium"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "w-5 h-5 transition-transform",
                    item.active && "scale-110 stroke-[2.5]"
                  )}
                />
                {item.active && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
