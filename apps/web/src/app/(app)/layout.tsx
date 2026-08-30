"use client";

import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/route-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <RouteGuard>{children}</RouteGuard>
    </AppShell>
  );
}
