"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const [margin, setMargin] = useState("15");
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["platform-config"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getPlatformConfig();
      setMargin(String(result.data.defaultSkyarcMarginPercent));
      return result.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.updatePlatformConfig({
        defaultSkyarcMarginPercent: Number(margin),
      });
    },
    onSuccess: async () => {
      setMessage("Platform settings saved.");
      await queryClient.invalidateQueries({ queryKey: ["platform-config"] });
    },
  });

  return (
    <div className="max-w-xl mx-auto w-full">
      <PageHeader
        title="Platform settings"
        description="Defaults applied to all vendor organizations unless overridden"
      />

      {isLoading && <p className="text-muted text-sm">Loading…</p>}

      {data && (
        <form
          className="card-surface p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="text-muted font-medium">Default Skyarc margin %</span>
            <input
              type="number"
              min={0}
              max={99}
              step={0.5}
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
            />
            <p className="text-xs text-muted mt-1">
              Used when a vendor org has no custom margin. Currency: {data.currency}
            </p>
          </label>

          {message && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {message}
            </p>
          )}

          <button type="submit" disabled={saveMutation.isPending} className="btn-primary px-5 py-2.5">
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
