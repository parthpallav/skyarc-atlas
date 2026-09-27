"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/hooks/use-permissions";
import { AdminSkyarcIndexSettings } from "@/components/admin-skyarc-index-settings";

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { isSuperAdmin, isAdmin } = usePermissions();
  const [margin, setMargin] = useState("15");
  const [showVendorDetails, setShowVendorDetails] = useState(true);
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-config"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getPlatformConfig();
      return result.data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setMargin(String(data.defaultSkyarcMarginPercent));
    setShowVendorDetails(data.showVendorDetailsOnLocationPage !== false);
  }, [data]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#skyarc-index") {
      document.getElementById("skyarc-index")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.updatePlatformConfig({
        defaultSkyarcMarginPercent: Number(margin),
        showVendorDetailsOnLocationPage: showVendorDetails,
      });
    },
    onSuccess: async () => {
      setMessage("Platform settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["platform-config"] });
      await queryClient.invalidateQueries({ queryKey: ["location"] });
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
      await queryClient.invalidateQueries({ queryKey: ["screen-inventories"] });
    },
  });

  const canEditSettings = isSuperAdmin || isAdmin;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-16">
      <PageHeader
        title="Settings"
        description="Platform defaults, showcase controls, and Skyarc Index weights"
      />

      {!canEditSettings ? (
        <p className="text-sm text-muted">Only Superadmin / Admin can manage settings.</p>
      ) : null}

      {isLoading && <p className="text-sm text-muted">Loading…</p>}

      {data && canEditSettings ? (
        <form
          className="card-surface space-y-5 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <h2 className="text-sm font-semibold text-slate-900">Platform</h2>
          <label className="block text-sm">
            <span className="font-medium text-muted">Default Skyarc margin %</span>
            <input
              type="number"
              min={0}
              max={99}
              step={0.5}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
            />
            <p className="mt-1 text-xs text-muted">
              Used when a vendor org has no custom margin. Currency: {data.currency}
            </p>
          </label>

          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-violet-300 text-primary focus:ring-primary/30"
                checked={showVendorDetails}
                onChange={(e) => setShowVendorDetails(e.target.checked)}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  Show vendor details on location pages
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">
                  When off, media owner, vendor media codes, and vendor rates are hidden on location
                  details — useful while screen-sharing with a client. Skyarc client rates stay
                  visible. Vendors still see their own commercial data.
                </span>
              </span>
            </label>
            {!showVendorDetails ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Showcase mode is on — vendor identity and vendor rates are hidden for internal users.
              </p>
            ) : null}
          </div>

          {message ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          ) : null}

          <button type="submit" disabled={saveMutation.isPending} className="btn-primary px-5 py-2.5">
            {saveMutation.isPending ? "Saving…" : "Save platform settings"}
          </button>
        </form>
      ) : null}

      {canEditSettings ? <AdminSkyarcIndexSettings /> : null}
    </div>
  );
}
