"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";

type ScenarioLine = {
  inventoryId: string;
  locationName: string;
  skyarcSiteCode: string | null;
  inventoryType: string | null;
  road: string | null;
  reason: string;
  flightCost: number;
  availabilityFreshness: string;
};

type Scenario = {
  kind: "COVERAGE" | "CONCENTRATION";
  label: string;
  strategySummary: string;
  tradeOffs: string[];
  lines: ScenarioLine[];
  totalCost: number;
  siteCount: number;
  formatCount: number;
  roadCount: number;
};

type Bundle = {
  coverage: Scenario | null;
  concentration: Scenario | null;
  meaningfullyDifferent: boolean;
  limitation: string | null;
  evidenceLimitations: string[];
};

function ScenarioCard({
  scenario,
  selected,
  onSelect,
}: {
  scenario: Scenario;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left rounded-2xl border bg-white p-4 shadow-sm transition-all w-full",
        selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{scenario.label}</h3>
          <p className="text-xs text-muted mt-1">{scenario.strategySummary}</p>
        </div>
        <p className="text-sm font-semibold text-slate-900 shrink-0">{formatInr(scenario.totalCost)}</p>
      </div>
      <p className="text-[11px] text-muted mt-2">
        {scenario.siteCount} sites · {scenario.formatCount} formats · {scenario.roadCount} corridors
      </p>
      <ul className="mt-3 space-y-1.5 max-h-40 overflow-auto">
        {scenario.lines.slice(0, 6).map((l) => (
          <li key={l.inventoryId} className="text-xs text-slate-700">
            <span className="font-medium">{l.skyarcSiteCode ?? l.locationName}</span>
            <span className="text-muted"> · {l.reason}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1">
        {scenario.tradeOffs.map((t) => (
          <span key={t} className="text-[10px] rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            {t}
          </span>
        ))}
      </div>
    </button>
  );
}

export default function CampaignScenariosPage() {
  const params = useParams();
  const campaignId = String(params.id);
  const router = useRouter();
  const [selected, setSelected] = useState<"COVERAGE" | "CONCENTRATION" | null>(null);
  const [feedback, setFeedback] = useState("");

  const scenariosQuery = useQuery({
    queryKey: ["scenarios", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.generateScenarios(campaignId);
      return result.data as Bundle;
    },
  });

  const issueMutation = useMutation({
    mutationFn: async (kind: "COVERAGE" | "CONCENTRATION") => {
      const client = createWebApiClient();
      return client.issueProposal(campaignId, { scenarioKind: kind });
    },
    onSuccess: (result) => {
      const data = result.data as { proposal?: { id?: string } };
      if (data.proposal?.id) router.push(`/proposals/${data.proposal.id}`);
      else setFeedback("Proposal issued");
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Issue failed"),
  });

  const bundle = scenariosQuery.data;

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-5xl">
      <Link href={`/campaigns/${campaignId}`} className="text-sm text-muted hover:text-primary w-fit">
        ← Campaign
      </Link>
      <PageHeader
        title="Compare scenarios"
        description="Coverage vs concentration — generating scenarios does not reserve inventory."
      />

      {scenariosQuery.isLoading ? (
        <p className="text-sm text-muted">Generating scenarios…</p>
      ) : scenariosQuery.error ? (
        <p className="text-sm text-rose-700">Could not generate scenarios.</p>
      ) : (
        <>
          {bundle?.limitation ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {bundle.limitation}
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {bundle?.coverage ? (
              <ScenarioCard
                scenario={bundle.coverage}
                selected={selected === "COVERAGE"}
                onSelect={() => setSelected("COVERAGE")}
              />
            ) : null}
            {bundle?.concentration ? (
              <ScenarioCard
                scenario={bundle.concentration}
                selected={selected === "CONCENTRATION"}
                onSelect={() => setSelected("CONCENTRATION")}
              />
            ) : null}
          </div>
          {bundle?.evidenceLimitations?.length ? (
            <ul className="text-[11px] text-muted list-disc pl-4">
              {bundle.evidenceLimitations.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              disabled={!selected || issueMutation.isPending}
              onClick={() => selected && issueMutation.mutate(selected)}
              className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
            >
              {issueMutation.isPending ? "Issuing…" : "Issue proposal from selection"}
            </button>
            {feedback ? <span className="text-xs text-muted">{feedback}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
