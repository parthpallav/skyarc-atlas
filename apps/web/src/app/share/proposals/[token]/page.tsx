"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";

export default function PublicProposalSharePage() {
  const params = useParams();
  const token = String(params.token);

  const query = useQuery({
    queryKey: ["public-proposal", token],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getPublicProposalShare(token);
      return result.data as {
        snapshot: {
          campaignName: string;
          advertiserName: string;
          strategySummary: string;
          totalCost: number;
          currency: string;
          lines: Array<{ locationName: string; skyarcSiteCode: string | null; flightCost: number }>;
        };
        viewOnly: boolean;
        canAccept: boolean;
        canPay: boolean;
      };
    },
  });

  if (query.isLoading) return <main className="p-6 text-sm">Loading proposal…</main>;
  if (query.error || !query.data) {
    return <main className="p-6 text-sm text-rose-700">Share link invalid, expired, or revoked.</main>;
  }
  const { snapshot, canAccept, canPay } = query.data;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-4">
      <p className="text-[10px] uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 w-fit">
        View only — cannot book or pay
      </p>
      <h1 className="text-2xl font-bold text-slate-900">{snapshot.campaignName}</h1>
      <p className="text-sm text-muted">{snapshot.advertiserName}</p>
      <p className="text-sm">{snapshot.strategySummary}</p>
      <p className="text-lg font-semibold">{formatInr(snapshot.totalCost)}</p>
      <ul className="divide-y border rounded-xl bg-white">
        {snapshot.lines.map((l, i) => (
          <li key={i} className="px-4 py-2 text-sm flex justify-between gap-2">
            <span>{l.skyarcSiteCode ?? l.locationName}</span>
            <span>{formatInr(l.flightCost)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Accept={String(canAccept)} · Pay={String(canPay)}
      </p>
    </main>
  );
}
