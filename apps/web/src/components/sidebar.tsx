"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearTokens, getStoredUser, type StoredUser } from "@/lib/api";
import { SkyArcLogo } from "./skyarc-logo";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/map", label: "Map", icon: Map },
];

function roleLabel(role: string) {
  return role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function userInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

interface SidebarNavProps {
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  showCollapseToggle?: boolean;
  showLogo?: boolean;
}

export function SidebarNav({
  className,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
  showCollapseToggle = true,
  showLogo = true,
}: SidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function handleLogout() {
    clearTokens();
    onNavigate?.();
    router.push("/login");
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Logo + collapse */}
      {showLogo && (
      <div
        className={cn(
          "flex items-center shrink-0 border-b border-zinc-800/80",
          collapsed ? "flex-col gap-2 p-3" : "justify-between gap-2 p-4"
        )}
      >
        <SkyArcLogo
          height={collapsed ? 28 : 40}
          subtitle={collapsed ? undefined : "Atlas · DOOH Intelligence"}
          collapsed={collapsed}
          priority
        />
        {showCollapseToggle && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "shrink-0 p-1.5 rounded-md text-skyarc-on-dark-muted hover:bg-zinc-900 hover:text-skyarc-on-dark transition-colors",
              collapsed && "w-full flex justify-center"
            )}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      )}

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1 overflow-y-auto scrollbar-thin", collapsed ? "p-2" : "p-3")}>
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              title={collapsed ? link.label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-primary text-white shadow-sm shadow-purple-900/30"
                  : "text-skyarc-on-dark-muted hover:bg-zinc-900 hover:text-skyarc-on-dark"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User profile + sign out */}
      <div
        className={cn(
          "shrink-0 border-t border-zinc-800/80",
          collapsed ? "p-2" : "p-3"
        )}
      >
        {user && (
          <div
            className={cn(
              "flex items-center gap-3 mb-2",
              collapsed && "justify-center mb-3"
            )}
            title={collapsed ? `${user.name} (${user.email})` : undefined}
          >
            <div
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-zinc-800"
              aria-hidden
            >
              {userInitials(user.name, user.email)}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-skyarc-on-dark truncate leading-tight">
                  {user.name}
                </p>
                <p className="text-xs text-skyarc-on-dark-muted truncate">{user.email}</p>
                <span className="inline-block mt-1 text-[10px] font-medium uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  {roleLabel(user.role)}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex items-center w-full rounded-lg text-sm font-medium text-skyarc-on-dark-muted hover:bg-red-950/40 hover:text-red-300 transition-colors",
            collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}
