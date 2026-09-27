"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Index weights moved into Admin → Settings. */
export default function AdminScoringRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/settings#skyarc-index");
  }, [router]);
  return (
    <p className="py-12 text-center text-sm text-muted">Redirecting to Settings…</p>
  );
}
