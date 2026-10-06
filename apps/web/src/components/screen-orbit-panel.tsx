"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { ConfirmModal } from "@/components/confirm-modal";

type OrbitStatus = {
  attached: boolean;
  skyarcScreenCode?: string | null;
  device?: {
    id: string;
    status: string;
    deviceType: string;
    externalId: string;
    summaryJson?: {
      health?: string | null;
      lastHeartbeatAt?: string | null;
      claimCode?: string;
    };
  };
};

export function ScreenOrbitPanel({
  screenId,
  canWrite,
}: {
  screenId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { isReadOnly } = usePermissions();
  const writable = canWrite && !isReadOnly;
  const [detachOpen, setDetachOpen] = useState(false);
  const [error, setError] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["screen-orbit-status", screenId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getScreenOrbitStatus(screenId);
      return result.data as OrbitStatus;
    },
    retry: false,
  });

  const attach = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.attachScreenDevice(screenId, {
        provider: "orbit",
        deviceType: "orbit_edge",
      });
    },
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["screen-orbit-status", screenId] });
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Provisioning failed");
    },
  });

  const detach = useMutation({
    mutationFn: async (deviceId: string) => {
      const client = createWebApiClient();
      return client.deleteDevice(deviceId);
    },
    onSuccess: async () => {
      setDetachOpen(false);
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["screen-orbit-status", screenId] });
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Failed to detach Orbit");
      setDetachOpen(false);
    },
  });

  if (isLoading) {
    return <p className="mt-4 text-sm text-muted">Checking Orbit…</p>;
  }
  if (isError) {
    return (
      <p className="mt-4 text-sm text-muted">
        Orbit status unavailable. Inventory still works without Orbit.
      </p>
    );
  }
  if (!data?.attached) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">No Orbit device</p>
        <p className="mt-1 text-sm text-muted">
          Attach an Orbit Edge when this face needs live playback hardware.
        </p>
        {writable ? (
          <button
            type="button"
            className="btn-primary mt-3 px-4 py-2 text-sm disabled:opacity-50"
            disabled={attach.isPending}
            onClick={() => attach.mutate()}
          >
            {attach.isPending ? "Provisioning…" : "Attach Orbit Edge"}
          </button>
        ) : null}
        {(error || attach.isError) && (
          <p className="mt-2 text-sm text-rose-700">
            {error || (attach.error as Error)?.message || "Provisioning failed"}
          </p>
        )}
      </div>
    );
  }

  const summary = data.device?.summaryJson;
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-violet-100 bg-violet-50/30 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Orbit attached</p>
          <p className="mt-1 text-sm text-slate-700">
            Status: <span className="font-medium">{data.device?.status ?? "unknown"}</span>
          </p>
          {summary?.health != null ? (
            <p className="text-sm text-slate-600">Health: {String(summary.health)}</p>
          ) : null}
          {summary?.lastHeartbeatAt ? (
            <p className="text-xs text-muted">Last heartbeat: {summary.lastHeartbeatAt}</p>
          ) : null}
          {summary?.claimCode ? (
            <p className="mt-1 break-all text-sm text-amber-800">
              Claim code (one-time): {summary.claimCode}
            </p>
          ) : null}
        </div>
        {writable && data.device?.id ? (
          <button
            type="button"
            className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            onClick={() => setDetachOpen(true)}
          >
            Detach Orbit
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <ConfirmModal
        open={detachOpen}
        title="Detach Orbit"
        description="Remove the Orbit device link from this face? Hardware can be re-attached later."
        confirmLabel="Detach Orbit"
        danger
        busy={detach.isPending}
        onClose={() => {
          if (!detach.isPending) setDetachOpen(false);
        }}
        onConfirm={() => {
          if (data.device?.id) detach.mutate(data.device.id);
        }}
      />
    </div>
  );
}
