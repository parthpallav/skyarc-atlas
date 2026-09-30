"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";

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
      await queryClient.invalidateQueries({ queryKey: ["screen-orbit-status", screenId] });
    },
  });

  if (isLoading) {
    return <p className="text-xs text-muted mt-3">Checking Orbit…</p>;
  }
  if (isError) {
    return (
      <p className="text-xs text-muted mt-3">
        Orbit status unavailable. Inventory still works without Orbit.
      </p>
    );
  }
  if (!data?.attached) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-white px-3 py-2">
        <p className="text-xs font-medium text-slate-700">Orbit</p>
        <p className="text-xs text-muted mt-1">No Orbit device on this screen.</p>
        {writable && (
          <button
            type="button"
            className="mt-2 text-xs text-violet-700 hover:underline disabled:opacity-50"
            disabled={attach.isPending}
            onClick={() => attach.mutate()}
          >
            {attach.isPending ? "Provisioning…" : "Attach Orbit Edge"}
          </button>
        )}
        {attach.isError && (
          <p className="text-xs text-red-600 mt-1">
            {(attach.error as Error)?.message || "Provisioning failed"}
          </p>
        )}
      </div>
    );
  }

  const summary = data.device?.summaryJson;
  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 space-y-1">
      <p className="text-xs font-medium text-slate-700">Orbit</p>
      <p className="text-xs text-slate-600">
        Status: <span className="font-medium">{data.device?.status ?? "unknown"}</span>
      </p>
      {summary?.health != null && (
        <p className="text-xs text-slate-600">Health: {String(summary.health)}</p>
      )}
      {summary?.lastHeartbeatAt && (
        <p className="text-xs text-muted">Last heartbeat: {summary.lastHeartbeatAt}</p>
      )}
      {summary?.claimCode && (
        <p className="text-xs text-amber-700 break-all">
          Claim code (one-time): {summary.claimCode}
        </p>
      )}
    </div>
  );
}
