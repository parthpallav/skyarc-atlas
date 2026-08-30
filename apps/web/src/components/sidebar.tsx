"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { isVendorRole } from "@skyarc/shared";
import { cn } from "@/lib/utils";
import { createWebApiClient } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { getNavLinks } from "@/lib/navigation";
import { roleLabel } from "@/lib/permissions";
import { SkyarcLogo } from "./skyarc-logo";

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
  const { user, logout } = useAuth();

  const { data: organization } = useQuery({
    queryKey: ["organization-me", user?.organizationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getOrganizationMe();
      return result.data;
    },
    enabled: Boolean(user?.organizationId && isVendorRole(user.role)),
    staleTime: 60_000,
  });

  const links = getNavLinks(user);

  function handleLogout() {
    logout();
    onNavigate?.();
    router.push("/login");
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {showLogo && (
        <div
          className={cn(
            "flex items-center shrink-0 border-b border-zinc-800/80",
            collapsed ? "flex-col gap-2 p-3" : "justify-between gap-2 p-4"
          )}
        >
          <SkyarcLogo
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

      <nav
        className={cn(
          "flex-1 min-h-0 space-y-1 overflow-y-auto scrollbar-thin",
          collapsed ? "p-2" : "p-3"
        )}
      >
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

      <div
        className={cn(
          "shrink-0 border-t border-zinc-800/80",
          collapsed ? "p-2" : "p-3 space-y-1.5"
        )}
      >
        {user && (
          <Link
            href="/account"
            onClick={onNavigate}
            title={collapsed ? `${user.name} — Account Profile` : "Manage your account profile"}
            className={cn(
              "group flex items-center rounded-xl transition-all duration-150 border border-transparent",
              pathname === "/account"
                ? "bg-zinc-800/90 border-violet-500/40 shadow-inner"
                : "hover:bg-zinc-900/90 hover:border-zinc-800/80",
              collapsed ? "justify-center p-2" : "gap-3 p-2.5"
            )}
          >
            <div
              className={cn(
                "w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-zinc-800 group-hover:ring-primary/50 transition-all",
                pathname === "/account" && "ring-primary shadow-sm shadow-purple-500/50"
              )}
              aria-hidden
            >
              {userInitials(user.name, user.email)}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-sm font-semibold text-skyarc-on-dark truncate leading-tight group-hover:text-white transition-colors">
                    {user.name}
                  </p>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded shrink-0">
                    {roleLabel(user.role)}
                  </span>
                </div>
                <p className="text-xs text-skyarc-on-dark-muted truncate mt-0.5 group-hover:text-zinc-300 transition-colors">
                  {user.email}
                </p>
                {organization?.name && (
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-medium">
                    {organization.name}
                  </p>
                )}
              </div>
            )}
          </Link>
        )}

        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex items-center w-full rounded-lg text-xs font-medium text-skyarc-on-dark-muted hover:bg-red-950/40 hover:text-red-300 transition-colors",
            collapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-2"
          )}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}
