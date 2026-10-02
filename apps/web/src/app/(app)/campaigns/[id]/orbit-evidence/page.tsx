"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Radio } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

type EvidencePayload = {
  campaign: { id: string; name: string; startDate: string | null; endDate: string | null };
  devices: Array<{
    atlasDeviceId: string;
    orbitDeviceId: string;
    currentScreenId: string;
    historicalScreenIdAtMidFlight: string | null;
    freshness: {
      lastEventAt: string | null;
      atlasStatus: string;
      orbitConnected: boolean | null;
      sensorHealth: string;
      screenPower: string;
      playbackVerified: string;
      orbitReachable: boolean;
    };
    coverage: { missingOrbitState: boolean; missingEvidence: boolean };
    openIncidents: Array<{ kind: string; startedAt: string }>;
    mappings: Array<{
      screenId: string;
      validFrom: string;
      validTo: string | null;
      reason: string | null;
      conflictNote: string | null;
    }>;
    evidenceSource: string;
  }>;
  affectedBookingItems: Array<{ bookingItemId: string; kind: string; limitation: string }>;
  limitations: string[];
  note?: string;
};

export default function CampaignOrbitEvidencePage() {
  const params = useParams();
  const campaignId = String(params.id);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["orbit-evidence", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const res = await client.getCampaignOrbitEvidence(campaignId);
      return res.data as EvidencePayload;
    },
  });

  const snapMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.createOrbitEvidenceSnapshot(campaignId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orbit-evidence", campaignId] }),
  });

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Orbit campaign evidence"
        description="Staff view of device freshness, coverage, incidents and booking associations. Missing evidence is explicit."
        action={
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => snapMutation.mutate()}
            disabled={snapMutation.isPending}
          >
            Save risk snapshot
          </button>
        }
      />
      <Link href={`/campaigns/${campaignId}`} className="text-sm text-muted hover:text-primary w-fit">
        ← Back to campaign
      </Link>

      {isLoading && <p className="text-sm text-muted">Loading evidence…</p>}
      {error && (
        <p className="text-sm text-red-700">
          {(error as Error).message}{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </p>
      )}

      {data?.limitations?.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm">
          <div className="font-medium inline-flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4" /> Evidence limitations
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {data.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data?.note && <p className="text-sm text-muted">{data.note}</p>}

      <div className="flex flex-col gap-4">
        {(data?.devices ?? []).map((d) => (
          <article key={d.atlasDeviceId} className="border border-border rounded-xl p-4 space-y-2">
            <div className="inline-flex items-center gap-2 font-medium text-sm">
              <Radio className="h-4 w-4" />
              Device {d.orbitDeviceId.slice(0, 8)}…
              <span className="text-xs text-muted">via {d.evidenceSource}</span>
            </div>
            <p className="text-sm">
              Connectivity:{" "}
              {d.freshness.orbitConnected == null
                ? "unknown"
                : d.freshness.orbitConnected
                  ? "online"
                  : "offline"}
              {" · "}Sensor {d.freshness.sensorHealth}
              {" · "}Screen power {d.freshness.screenPower}
              {" · "}Playback {d.freshness.playbackVerified}
            </p>
            <p className="text-xs text-muted">
              Last event {d.freshness.lastEventAt ?? "missing"} · Atlas status{" "}
              {d.freshness.atlasStatus}
              {d.coverage.missingEvidence ? " · missing evidence" : ""}
              {d.coverage.missingOrbitState ? " · Orbit unreachable" : ""}
            </p>
            <p className="text-xs text-muted">
              Current screen {d.currentScreenId.slice(0, 8)}… · Mid-flight historical screen{" "}
              {d.historicalScreenIdAtMidFlight?.slice(0, 8) ?? "—"}…
            </p>
            {d.mappings.length > 0 && (
              <ul className="text-xs list-disc pl-4">
                {d.mappings.map((m) => (
                  <li key={`${m.screenId}-${m.validFrom}`}>
                    {m.screenId.slice(0, 8)}… {m.validFrom} → {m.validTo ?? "open"}
                    {m.conflictNote ? ` (${m.conflictNote})` : ""}
                  </li>
                ))}
              </ul>
            )}
            {d.openIncidents.length > 0 && (
              <p className="text-xs text-amber-800">
                Open incidents: {d.openIncidents.map((i) => i.kind).join(", ")}
              </p>
            )}
          </article>
        ))}
        {data && data.devices.length === 0 && (
          <p className="text-sm text-muted">No Orbit devices on campaign booking screens.</p>
        )}
      </div>

      {data?.affectedBookingItems?.length ? (
        <div>
          <h2 className="text-sm font-medium mb-2">Affected booking associations</h2>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {data.affectedBookingItems.map((a) => (
              <li key={a.bookingItemId}>
                {a.bookingItemId.slice(0, 8)}… · {a.kind} — {a.limitation}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
