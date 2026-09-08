"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredToken } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { WorkspaceSkeleton } from "@/components/ui/skeleton";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, user } = useAuth();
  const { canAccessRoute, landingPath } = usePermissions();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const token = getStoredToken();
    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    if (!canAccessRoute(pathname)) {
      router.replace(landingPath);
      return;
    }

    setAllowed(true);
  }, [pathname, router, user, isLoading, canAccessRoute, landingPath]);

  if (isLoading || !allowed) {
    return <WorkspaceSkeleton />;
  }

  return <>{children}</>;
}
