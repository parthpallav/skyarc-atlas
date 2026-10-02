"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { formatInr } from "@/lib/format";

export default function CampaignOpsPage() {
  const params = useParams();
  const campaignId = String(params.id);

  const progressQuery = useQuery({
    queryKey: ["campaign-progress", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getCampaignProgress(campaignId);
      return result.data as {
        executionProgress: {
          openTasks: number;
          doneTasks: number;
          blockedTasks: number;
          overdueTasks: number;
          upcomingLaunches: Array<{ title: string; dueAt: string | null }>;
        };
        proof: { approved: number; pending: number; missing: boolean };
        creativesApproved: number;
        billing: Array<{
          invoiceNumber: string | null;
          status: string;
          totalMinor: number;
          amountPaidMinor: number;
          outstandingMinor: number;
        }>;
      };
    },
  });

  const creativesQuery = useQuery({
    queryKey: ["campaign-creatives", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaignCreatives(campaignId);
      return result.data.creatives as Array<{
        id: string;
        revisionNumber: number;
        status: string;
        label: string | null;
        cmsHandoffStatus: string;
      }>;
    },
  });

  const proofsQuery = useQuery({
    queryKey: ["campaign-proofs", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaignProofs(campaignId);
      return result.data.proofs as Array<{
        id: string;
        kind: string;
        reviewStatus: string;
        evidenceDisclaimer: string;
      }>;
    },
  });

  const p = progressQuery.data;

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-3xl">
      <Link href={`/campaigns/${campaignId}`} className="text-sm text-muted hover:text-primary w-fit">
        ← Campaign
      </Link>
      <PageHeader
        title="Campaign operations"
        description="Tasks, creative, proof, and customer-safe progress. Confirming a booking does not mark the campaign live."
      />
      {progressQuery.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : p ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Execution</p>
            <p className="text-sm mt-1">
              {p.executionProgress.doneTasks} done · {p.executionProgress.openTasks} open ·{" "}
              {p.executionProgress.blockedTasks} blocked · {p.executionProgress.overdueTasks} overdue
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Proof</p>
            <p className="text-sm mt-1">
              {p.proof.approved} approved · {p.proof.pending} pending
              {p.proof.missing ? " · missing proof pending" : ""}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Creatives approved</p>
            <p className="text-lg font-semibold mt-1">{p.creativesApproved}</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Billing (customer-safe)</p>
            <ul className="mt-1 space-y-1">
              {p.billing.length === 0 ? (
                <li className="text-sm text-muted">No issued invoices</li>
              ) : (
                p.billing.map((b, i) => (
                  <li key={i} className="text-sm">
                    {b.invoiceNumber ?? "—"} · {b.status.toLowerCase()} · due{" "}
                    {formatInr(b.outstandingMinor / 100)}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold mb-2">Creative versions</h2>
        <ul className="divide-y rounded-xl border bg-white">
          {(creativesQuery.data ?? []).map((c) => (
            <li key={c.id} className="px-4 py-2 text-sm flex justify-between gap-2">
              <span>
                Rev {c.revisionNumber} {c.label ? `· ${c.label}` : ""} · {c.status.toLowerCase()}
              </span>
              <span className="text-xs text-muted">{c.cmsHandoffStatus}</span>
            </li>
          ))}
          {(creativesQuery.data ?? []).length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No creatives yet</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Approved launch evidence</h2>
        <p className="text-xs text-muted mb-2">
          GPS and timestamps are supplied evidence, not guaranteed authenticity.
        </p>
        <ul className="divide-y rounded-xl border bg-white">
          {(proofsQuery.data ?? []).map((pr) => (
            <li key={pr.id} className="px-4 py-2 text-sm">
              {pr.kind} · {pr.reviewStatus.toLowerCase()}
            </li>
          ))}
          {(proofsQuery.data ?? []).length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No approved proof yet — remains pending</li>
          )}
        </ul>
      </section>

      <Link
        href={`/campaigns/${campaignId}/billing`}
        className="btn-secondary text-sm px-4 py-2 w-fit"
      >
        Billing & collections
      </Link>
    </div>
  );
}
