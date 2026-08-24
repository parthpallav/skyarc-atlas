"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { SidebarNav } from "./sidebar";
import { SkyArcLogo } from "./skyarc-logo";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "skyarc-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  const desktopSidebarWidth = collapsed ? "md:w-[4.5rem]" : "md:w-60 lg:w-64";

  return (
    <div className="flex min-h-screen min-h-[100dvh] bg-skyarc-surface">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex shrink-0 bg-sidebar border-r border-zinc-900 transition-[width] duration-200 ease-in-out flex-col",
          desktopSidebarWidth
        )}
      >
        <SidebarNav
          className="w-full h-full min-h-screen"
          collapsed={mounted && collapsed}
          onToggleCollapse={toggleCollapse}
          showCollapseToggle
        />
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-sidebar border-r border-zinc-900 transform transition-transform duration-200 md:hidden flex flex-col",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <SkyArcLogo height={36} subtitle="Atlas" />
          <button
            type="button"
            aria-label="Close menu"
            className="p-2 rounded-lg text-skyarc-on-dark-muted hover:bg-zinc-900 hover:text-skyarc-on-dark"
            onClick={() => setMobileOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <SidebarNav
          className="flex-1 min-h-0"
          onNavigate={() => setMobileOpen(false)}
          showCollapseToggle={false}
          showLogo={false}
        />
      </aside>

      <div className="flex flex-1 flex-col min-w-0 min-h-screen">
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-violet-100 bg-white/95 backdrop-blur px-4 py-3 safe-top shadow-sm shrink-0">
          <button
            type="button"
            aria-label="Open menu"
            className="p-2 -ml-2 rounded-lg text-slate-700 hover:bg-violet-50"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="bg-black rounded-lg px-3 py-1.5">
            <SkyArcLogo height={26} collapsed />
          </div>
          <span className="text-xs font-semibold text-muted uppercase tracking-wider ml-auto">
            Atlas
          </span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden w-full max-w-[1600px] mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
