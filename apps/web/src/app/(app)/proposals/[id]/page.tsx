"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { formatInr } from "@/lib/format";
import { formatDateIn } from "@/lib/dates";

type Proposal = {
  id: string;
  campaignId: string;
  revisionNumber: number;
  status: string;
  scenarioKind: string;
  total: number;
  currency: string;
  expiresAt: string;
  acceptedBookingId?: string | null;
  snapshot: {
    campaignName: string;
    advertiserName: string;
    strategySummary: string;
    tradeOffs: string[];
    evidenceLimitations: string[];
    flight: { start: string | null; end: string | null };
    lines: Array<{
      inventoryId: string;
      locationName: string;
      skyarcSiteCode: string | null;
      reason: string;
      flightCost: number;
    }>;
  };
};

export default function ProposalDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [shareUrl, setShareUrl] = useState("");

  const proposalQuery = useQuery({
    queryKey: ["proposal", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getProposal(id);
      return result.data as Proposal;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.acceptProposal(id, { idempotencyKey: `ui-proposal-${id}` });
    },
    onSuccess: async (result) => {
      const data = result.data as { booking?: { id?: string } };
      setFeedback("Accepted — capacity reserved");
      await queryClient.invalidateQueries({ queryKey: ["proposal", id] });
      if (data.booking?.id) router.push(`/bookings/${data.booking.id}`);
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Accept failed"),
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.createProposalShare(id, { ttlHours: 72 });
    },
    onSuccess: (result) => {
      const data = result.data as { token: string };
      const url = `${window.location.origin}/share/proposals/${data.token}`;
      setShareUrl(url);
      setFeedback("View-only share link created (does not authorize booking)");
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Share failed"),
  });

  const p = proposalQuery.data;
  if (proposalQuery.isLoading) return <p className="text-sm text-muted p-6">Loading…</p>;
  if (!p) return <p className="text-sm text-rose-700 p-6">Proposal not found</p>;

  async function downloadExport(kind: "pdf" | "xlsx" | "pptx") {
    const token = (await import("@/lib/api")).getStoredToken();
    const base = (await import("@/lib/api")).getApiBaseUrl();
    const res = await fetch(`${base}/v1/proposals/${id}/export/${kind}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setFeedback(`Export failed (${res.status})`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-3xl">
      <Link href={`/campaigns/${p.campaignId}/scenarios`} className="text-sm text-muted hover:text-primary w-fit">
        ← Scenarios
      </Link>
      <PageHeader
        title={p.snapshot.campaignName}
        description={`Revision ${p.revisionNumber} · ${p.scenarioKind.toLowerCase()} · ${p.status.toLowerCase()}`}
      />
      <p className="text-sm text-slate-700">{p.snapshot.strategySummary}</p>
      <p className="text-lg font-semibold">
        {p.currency === "INR" ? formatInr(p.total) : `${p.currency} ${p.total}`}
      </p>
      <p className="text-xs text-muted">
        Flight {formatDateIn(p.snapshot.flight.start)} → {formatDateIn(p.snapshot.flight.end)} · expires{" "}
        {formatDateIn(p.expiresAt)}
      </p>

      <ul className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
        {p.snapshot.lines.map((l) => (
          <li key={l.inventoryId} className="px-4 py-3 text-sm">
            <span className="font-medium">{l.skyarcSiteCode ?? l.locationName}</span>
            <span className="text-muted"> · {formatInr(l.flightCost)}</span>
            <p className="text-xs text-muted mt-0.5">{l.reason}</p>
          </li>
        ))}
      </ul>

      {feedback ? <p className="text-xs text-muted">{feedback}</p> : null}
      {shareUrl ? (
        <p className="text-xs break-all bg-slate-50 border border-slate-200 rounded-lg p-2">{shareUrl}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {p.status === "ISSUED" ? (
          <button
            type="button"
            className="btn-primary text-sm px-4 py-2"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
          >
            {acceptMutation.isPending ? "Accepting…" : "Accept & reserve"}
          </button>
        ) : null}
        {p.acceptedBookingId ? (
          <Link href={`/bookings/${p.acceptedBookingId}`} className="btn-secondary text-sm px-4 py-2">
            View booking
          </Link>
        ) : null}
        <button type="button" className="btn-secondary text-sm px-4 py-2" onClick={() => shareMutation.mutate()}>
          Create view-only share link
        </button>
        <button type="button" className="btn-secondary text-sm px-4 py-2" onClick={() => downloadExport("pdf")}>PDF</button>
        <button type="button" className="btn-secondary text-sm px-4 py-2" onClick={() => downloadExport("xlsx")}>Excel</button>
        <button type="button" className="btn-secondary text-sm px-4 py-2" onClick={() => downloadExport("pptx")}>PPTX</button>
      </div>
    </div>
  );
}
