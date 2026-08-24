"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Sparkles, Wand2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

interface ParsedBrief {
  targetAudience?: string;
  budget?: number;
  durationDays?: number;
  brandCategory?: string;
  geographicFocus?: string[];
  categories?: string[];
  objectives?: string[];
  kpis?: string[];
  constraints?: string[];
}

interface PlanItemRow {
  id: string;
  rank: number | null;
  budgetAllocated: number;
  location?: { id: string; name: string; road?: string | null };
}

interface MediaPlanRow {
  id: string;
  name: string;
  status: string;
  totalBudget: string | number;
  createdAt: string;
  _count?: { items: number };
  items?: PlanItemRow[];
}

interface CampaignDetail {
  id: string;
  name: string;
  createdAt: string;
  advertiser?: { name: string };
  brief?: {
    sourceText: string | null;
    parseStatus: string;
    structuredRequirementsJson?: ParsedBrief | null;
  } | null;
  mediaPlans?: MediaPlanRow[];
}

function hasParsedBrief(data?: ParsedBrief | null) {
  if (!data) return false;
  return Boolean(
    data.targetAudience ||
      data.budget ||
      data.durationDays ||
      data.brandCategory ||
      (data.geographicFocus && data.geographicFocus.length > 0) ||
      (data.categories && data.categories.length > 0) ||
      (data.objectives && data.objectives.length > 0) ||
      (data.kpis && data.kpis.length > 0) ||
      (data.constraints && data.constraints.length > 0)
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-muted text-xs font-medium uppercase mb-1">{title}</p>
      <ul className="list-disc list-inside text-slate-800 space-y-0.5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [briefText, setBriefText] = useState("");
  const [budget, setBudget] = useState("500000");
  const [maxLocations, setMaxLocations] = useState("10");
  const [planName, setPlanName] = useState("Optimized Plan");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const {
    data: campaign,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getCampaign(id);
      return result.data as CampaignDetail;
    },
  });

  useEffect(() => {
    if (!campaign) return;
    if (campaign.brief?.sourceText) {
      setBriefText(campaign.brief.sourceText);
    }
    const parsed = campaign.brief?.structuredRequirementsJson;
    if (parsed?.budget) {
      setBudget(String(parsed.budget));
    }
  }, [campaign]);

  const briefMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const text = briefText.trim();
      if (!text) throw new Error("Brief text is required");
      return client.updateCampaignBrief(id, text);
    },
    onSuccess: async () => {
      setMessage("Brief saved.");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to save brief"),
  });

  const parseMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.parseCampaignBrief(id);
    },
    onSuccess: async () => {
      setMessage("Brief parsed with AI.");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Brief parsing failed"),
  });

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const totalBudget = Number(budget);
      const max = maxLocations.trim() ? Number(maxLocations) : undefined;
      if (Number.isNaN(totalBudget) || totalBudget <= 0) {
        throw new Error("Enter a valid budget");
      }
      if (max !== undefined && (Number.isNaN(max) || max <= 0)) {
        throw new Error("Enter a valid max locations");
      }
      return client.optimizeMediaPlan(id, {
        name: planName.trim() || "Optimized Plan",
        totalBudget,
        maxLocations: max,
      });
    },
    onSuccess: async (result) => {
      const data = result.data as {
        plan?: { id?: string; items?: unknown[] };
      };
      const itemCount = data.plan?.items?.length ?? 0;
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      if (data.plan?.id) {
        router.push(`/campaigns/${id}/plans/${data.plan.id}`);
        return;
      }
      setMessage(
        itemCount > 0
          ? `Media plan created with ${itemCount} site(s).`
          : "Plan created but no sites were allocated."
      );
      setError("");
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Optimization failed";
      setError(msg);
      setMessage("");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-6" />
        <div className="h-64 card-surface animate-pulse bg-slate-50" />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">
          {loadError instanceof Error ? loadError.message : "Campaign not found"}
        </p>
        <Link href="/campaigns" className="text-primary hover:underline text-sm font-medium">
          Back to campaigns
        </Link>
      </div>
    );
  }

  const parsed = campaign.brief?.structuredRequirementsJson;
  const canParse = Boolean(briefText.trim() || campaign.brief?.sourceText);

  return (
    <div className="max-w-4xl mx-auto w-full">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Campaigns
      </Link>

      <PageHeader
        title={campaign.name}
        description={`${campaign.advertiser?.name ?? "Advertiser"} · Created ${new Date(campaign.createdAt).toLocaleDateString()}`}
      />

      {(message || error) && (
        <p
          className={`text-sm mb-4 px-3 py-2 rounded-lg border ${
            error
              ? "text-red-700 bg-red-50 border-red-200"
              : "text-emerald-700 bg-emerald-50 border-emerald-200"
          }`}
        >
          {error || message}
        </p>
      )}

      <section className="card-surface p-5 sm:p-6 mb-4">
        <h2 className="font-semibold text-slate-900 mb-3">Campaign overview</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted font-medium">Advertiser</dt>
            <dd className="text-slate-900 mt-0.5">{campaign.advertiser?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted font-medium">Brief status</dt>
            <dd className="text-slate-900 mt-0.5">{campaign.brief?.parseStatus ?? "NONE"}</dd>
          </div>
          <div>
            <dt className="text-muted font-medium">Media plans</dt>
            <dd className="text-slate-900 mt-0.5">{campaign.mediaPlans?.length ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted font-medium">Category</dt>
            <dd className="text-slate-900 mt-0.5">{parsed?.brandCategory ?? "—"}</dd>
          </div>
        </dl>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mt-4">
          <div>
            <dt className="text-muted font-medium">Parsed budget</dt>
            <dd className="text-slate-900 mt-0.5">
              {parsed?.budget ? formatInr(Number(parsed.budget)) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted font-medium">Duration</dt>
            <dd className="text-slate-900 mt-0.5">
              {parsed?.durationDays ? `${parsed.durationDays} days` : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card-surface p-5 sm:p-6 mb-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Campaign brief</h2>
          <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
            {campaign.brief?.parseStatus ?? "NONE"}
          </span>
        </div>

        <textarea
          className={`${inputClass} min-h-[140px]`}
          value={briefText}
          onChange={(e) => setBriefText(e.target.value)}
          placeholder="Describe audience, budget, duration, and campaign goals…"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary gap-2"
            disabled={briefMutation.isPending}
            onClick={() => {
              setMessage("");
              setError("");
              briefMutation.mutate();
            }}
          >
            Save brief
          </button>
          <button
            type="button"
            className="btn-primary gap-2"
            disabled={parseMutation.isPending || !canParse}
            onClick={() => {
              setMessage("");
              setError("");
              parseMutation.mutate();
            }}
          >
            <Sparkles className="w-4 h-4" />
            {parseMutation.isPending ? "Parsing…" : "Parse with AI"}
          </button>
        </div>

        {hasParsedBrief(parsed) && (
          <div className="rounded-lg bg-violet-50 border border-violet-100 p-4 text-sm space-y-3">
            <p className="font-medium text-slate-900">Parsed requirements</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {parsed?.targetAudience && (
                <div>
                  <dt className="text-muted text-xs font-medium uppercase">Audience</dt>
                  <dd className="text-slate-900 mt-0.5">{parsed.targetAudience}</dd>
                </div>
              )}
              {parsed?.budget != null && (
                <div>
                  <dt className="text-muted text-xs font-medium uppercase">Budget</dt>
                  <dd className="text-slate-900 mt-0.5">{formatInr(Number(parsed.budget))}</dd>
                </div>
              )}
              {parsed?.durationDays != null && (
                <div>
                  <dt className="text-muted text-xs font-medium uppercase">Duration</dt>
                  <dd className="text-slate-900 mt-0.5">{parsed.durationDays} days</dd>
                </div>
              )}
              {parsed?.brandCategory && (
                <div>
                  <dt className="text-muted text-xs font-medium uppercase">Category</dt>
                  <dd className="text-slate-900 mt-0.5">{parsed.brandCategory}</dd>
                </div>
              )}
            </dl>
            {parsed?.geographicFocus && parsed.geographicFocus.length > 0 && (
              <div>
                <p className="text-muted text-xs font-medium uppercase mb-1">Geographic focus</p>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.geographicFocus.map((area) => (
                    <span
                      key={area}
                      className="text-xs px-2 py-0.5 rounded-full bg-white border border-violet-200 text-slate-700"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {parsed?.categories && parsed.categories.length > 0 && (
              <div>
                <p className="text-muted text-xs font-medium uppercase mb-1">Categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.categories.map((cat) => (
                    <span
                      key={cat}
                      className="text-xs px-2 py-0.5 rounded-full bg-white border border-violet-200 text-slate-700"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {parsed?.objectives && parsed.objectives.length > 0 && (
              <BriefList title="Objectives" items={parsed.objectives} />
            )}
            {parsed?.kpis && parsed.kpis.length > 0 && (
              <BriefList title="KPIs" items={parsed.kpis} />
            )}
            {parsed?.constraints && parsed.constraints.length > 0 && (
              <BriefList title="Constraints" items={parsed.constraints} />
            )}
          </div>
        )}
      </section>

      <section className="card-surface p-5 sm:p-6 mb-4 space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          Optimize media plan
        </h2>
        <p className="text-sm text-muted">
          Ranks available inventory by location score and splits your budget. New Rajkot imports include
          scores automatically; for older data run{" "}
          <code className="text-xs bg-slate-100 px-1 rounded">pnpm db:seed:media-planning</code>.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan name</label>
            <input className={inputClass} value={planName} onChange={(e) => setPlanName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Total budget (₹)</label>
            <input className={inputClass} type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max locations</label>
            <input
              className={inputClass}
              type="number"
              value={maxLocations}
              onChange={(e) => setMaxLocations(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn-primary"
          disabled={optimizeMutation.isPending}
          onClick={() => {
            setMessage("");
            setError("");
            optimizeMutation.mutate();
          }}
        >
          {optimizeMutation.isPending ? "Optimizing…" : "Generate media plan"}
        </button>
      </section>

      <section className="card-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-violet-100">
          <h2 className="font-semibold text-slate-900">Media plans</h2>
        </div>
        {(campaign.mediaPlans ?? []).length === 0 ? (
          <p className="text-muted text-sm px-5 py-4">No media plans yet. Run the optimizer above.</p>
        ) : (
          <ul className="divide-y divide-violet-50">
            {(campaign.mediaPlans ?? []).map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/campaigns/${id}/plans/${plan.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-violet-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{plan.name}</p>
                    <p className="text-xs text-muted">
                      {new Date(plan.createdAt).toLocaleString()} ·{" "}
                      {plan._count?.items ?? plan.items?.length ?? 0} sites · {plan.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-slate-900">
                      {formatInr(Number(plan.totalBudget))}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
