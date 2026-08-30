"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Wand2,
  Edit3,
  CheckCircle2,
  Layers,
  MapPin,
  Target,
  Clock,
  IndianRupee,
  ShieldCheck,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { CampaignBriefBuilder } from "@/components/campaign-brief-form";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

interface ParsedBrief {
  objective?: string;
  brandCategory?: string;
  targetAudience?: string | string[];
  geographicFocus?: string[];
  preferredFormats?: string[];
  categories?: string[];
  objectives?: string[];
  kpis?: string[];
  constraints?: string[];
  budget?: number;
  durationDays?: number;
  additionalNotes?: string;
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

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [briefPayload, setBriefPayload] = useState<{
    sourceText: string;
    structuredRequirements: Record<string, unknown>;
  }>({
    sourceText: "",
    structuredRequirements: {},
  });

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
    const parsed = campaign.brief?.structuredRequirementsJson;
    if (parsed?.budget) {
      setBudget(String(parsed.budget));
    }
    if (campaign.name) {
      setPlanName(`${campaign.name} — Recommended Plan`);
    }
  }, [campaign]);

  const saveBriefMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.updateCampaignBrief(id, {
        sourceText: briefPayload.sourceText || undefined,
        structuredRequirements:
          Object.keys(briefPayload.structuredRequirements).length > 0
            ? briefPayload.structuredRequirements
            : undefined,
      });
    },
    onSuccess: async () => {
      setMessage("Campaign requirements updated successfully.");
      setError("");
      setIsEditingBrief(false);
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Failed to update brief"),
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
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      if (data.plan?.id) {
        router.push(`/campaigns/${id}/plans/${data.plan.id}`);
        return;
      }
      setMessage("Media plan created successfully.");
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Optimization failed"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-28 rounded mb-2" />
        <PageHeaderSkeleton />
        <div className="card-surface p-6 space-y-4">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <div className="flex flex-wrap gap-2 pt-2">
            <Skeleton className="h-6 w-24 rounded-lg" />
            <Skeleton className="h-6 w-28 rounded-lg" />
            <Skeleton className="h-6 w-32 rounded-lg" />
          </div>
        </div>
        <div className="card-surface p-6 space-y-4">
          <Skeleton className="h-6 w-40 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div>
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Campaigns
        </Link>
        <p className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">
          {loadError instanceof Error ? loadError.message : "Campaign not found"}
        </p>
      </div>
    );
  }

  const parsed = campaign.brief?.structuredRequirementsJson;
  const audienceList = Array.isArray(parsed?.targetAudience)
    ? parsed.targetAudience
    : parsed?.targetAudience
    ? [parsed.targetAudience]
    : [];

  return (
    <div className="space-y-6 pb-12">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Campaigns
      </Link>

      <PageHeader
        title={campaign.name}
        description={`${campaign.advertiser?.name ?? "Advertiser"} · Created ${new Date(
          campaign.createdAt
        ).toLocaleDateString()}`}
      />

      {(message || error) && (
        <p
          className={`text-sm px-4 py-3 rounded-xl border ${
            error
              ? "text-red-700 bg-red-50 border-red-200"
              : "text-emerald-700 bg-emerald-50 border-emerald-200 font-medium"
          }`}
        >
          {error || message}
        </p>
      )}

      {/* Campaign Requirements / Brief Card */}
      <section className="card-surface p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-violet-100 pb-4">
          <div>
            <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Campaign Requirements & Brief
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Structured parameters driving the inventory matching & media plan engine
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                campaign.brief?.parseStatus === "PARSED"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              Status: {campaign.brief?.parseStatus ?? "PENDING"}
            </span>
            <button
              type="button"
              onClick={() => setIsEditingBrief(!isEditingBrief)}
              className="btn-secondary text-xs px-3 py-1.5 gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {isEditingBrief ? "Close Editor" : "Edit Brief / Form"}
            </button>
          </div>
        </div>

        {isEditingBrief ? (
          <div className="space-y-4 pt-2">
            <CampaignBriefBuilder
              initialValues={{
                sourceText: campaign.brief?.sourceText ?? "",
                structuredRequirements: {
                  objective: parsed?.objective,
                  brandCategory: parsed?.brandCategory,
                  targetAudience: audienceList,
                  geographicFocus: parsed?.geographicFocus,
                  preferredFormats: parsed?.preferredFormats,
                  budget: parsed?.budget,
                  durationDays: parsed?.durationDays,
                  kpis: parsed?.kpis,
                  constraints: parsed?.constraints,
                  additionalNotes: parsed?.additionalNotes,
                },
              }}
              onChange={setBriefPayload}
            />
            <div className="flex justify-end gap-2 pt-3 border-t border-violet-100">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsEditingBrief(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary min-w-[140px]"
                disabled={saveBriefMutation.isPending}
                onClick={() => saveBriefMutation.mutate()}
              >
                {saveBriefMutation.isPending ? "Saving…" : "Save Brief Requirements"}
              </button>
            </div>
          </div>
        ) : (
          /* View Mode: Clean Badges & Overview */
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-violet-50/60 border border-violet-100">
                <span className="text-[11px] font-semibold text-muted uppercase flex items-center gap-1">
                  <Target className="w-3 h-3 text-primary" /> Objective
                </span>
                <p className="font-bold text-slate-900 text-sm mt-1">
                  {parsed?.objective ?? "Brand Awareness"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-violet-50/60 border border-violet-100">
                <span className="text-[11px] font-semibold text-muted uppercase flex items-center gap-1">
                  <Layers className="w-3 h-3 text-primary" /> Category
                </span>
                <p className="font-bold text-slate-900 text-sm mt-1">
                  {parsed?.brandCategory ?? "General Retail"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
                  <IndianRupee className="w-3 h-3 text-emerald-600" /> Target Budget
                </span>
                <p className="font-bold text-emerald-950 text-sm mt-1">
                  {parsed?.budget ? formatInr(Number(parsed.budget)) : formatInr(Number(budget))}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-violet-50/60 border border-violet-100">
                <span className="text-[11px] font-semibold text-muted uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3 text-primary" /> Duration
                </span>
                <p className="font-bold text-slate-900 text-sm mt-1">
                  {parsed?.durationDays ? `${parsed.durationDays} Days` : "30 Days"}
                </p>
              </div>
            </div>

            {/* Target Corridors */}
            {parsed?.geographicFocus && parsed.geographicFocus.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-slate-700 uppercase flex items-center gap-1.5 mb-2">
                  <MapPin className="w-3.5 h-3.5 text-primary" /> Target Corridors & Arterial Roads
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.geographicFocus.map((geo) => (
                    <span
                      key={geo}
                      className="text-xs font-medium px-3 py-1 rounded-full bg-violet-100 text-violet-800 border border-violet-200"
                    >
                      {geo}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Target Audience & Formats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {audienceList.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-700 uppercase block mb-2">
                    Target Audience
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {audienceList.map((aud) => (
                      <span
                        key={aud}
                        className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200"
                      >
                        {aud}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parsed?.preferredFormats && parsed.preferredFormats.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-700 uppercase block mb-2">
                    Preferred Media Formats
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.preferredFormats.map((fmt) => (
                      <span
                        key={fmt}
                        className="text-xs px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-medium"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* KPIs & Constraints */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {parsed?.kpis && parsed.kpis.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-700 uppercase block mb-2">
                    Core KPIs
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.kpis.map((kpi) => (
                      <span
                        key={kpi}
                        className="text-xs px-2.5 py-1 rounded-md bg-purple-50 text-purple-800 border border-purple-200"
                      >
                        {kpi}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parsed?.constraints && parsed.constraints.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-700 uppercase flex items-center gap-1 mb-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> Constraints / Guardrails
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.constraints.map((c) => (
                      <span
                        key={c}
                        className="text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {campaign.brief?.sourceText && (
              <div className="mt-3 pt-3 border-t border-violet-100">
                <p className="text-xs font-semibold text-slate-600 uppercase mb-1">
                  Synthesized Brief Text
                </p>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-line font-mono">
                  {campaign.brief.sourceText}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Media Plan Optimization Engine */}
      <section className="card-surface p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-violet-100 pb-3">
          <div>
            <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Generate Media Plan
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Ranks high-score inventory and allocates budget proportionally based on location intelligence
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Plan Title
            </label>
            <input
              className={inputClass}
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g. Recommended High-Impact Plan"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Optimization Budget (₹)
            </label>
            <input
              className={inputClass}
              type="number"
              min="1000"
              step="50000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
            <p className="text-[11px] text-muted mt-1">{formatInr(Number(budget) || 0)}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Max Locations / Sites
            </label>
            <input
              className={inputClass}
              type="number"
              min="1"
              max="100"
              value={maxLocations}
              onChange={(e) => setMaxLocations(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="btn-primary min-w-[200px] gap-2 shadow-md"
            disabled={optimizeMutation.isPending}
            onClick={() => optimizeMutation.mutate()}
          >
            <Sparkles className="w-4 h-4" />
            {optimizeMutation.isPending ? "Generating Plan…" : "Generate Media Plan"}
          </button>
        </div>
      </section>

      {/* Existing Media Plans for this Campaign */}
      <section className="card-surface p-5 sm:p-6 space-y-4">
        <h2 className="font-bold text-slate-900 text-base">
          Media Plans ({campaign.mediaPlans?.length ?? 0})
        </h2>

        {(!campaign.mediaPlans || campaign.mediaPlans.length === 0) && (
          <div className="p-8 text-center bg-violet-50/50 rounded-xl border border-violet-100">
            <p className="text-sm text-slate-800 font-medium">No media plans generated yet</p>
            <p className="text-xs text-muted mt-1">
              Click &quot;Generate Media Plan&quot; above to allocate inventory and export PDF proposals.
            </p>
          </div>
        )}

        {campaign.mediaPlans && campaign.mediaPlans.length > 0 && (
          <div className="space-y-3">
            {campaign.mediaPlans.map((plan) => (
              <Link
                key={plan.id}
                href={`/campaigns/${campaign.id}/plans/${plan.id}`}
                className="p-4 rounded-xl border border-violet-100 bg-white hover:border-primary/40 hover:shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
              >
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{plan.name}</h3>
                  <p className="text-xs text-muted mt-0.5">
                    Created {new Date(plan.createdAt).toLocaleDateString()} · Budget:{" "}
                    {formatInr(Number(plan.totalBudget) || 0)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                    {plan._count?.items ?? plan.items?.length ?? 0} sites
                  </span>
                  <span className="text-xs text-primary font-semibold inline-flex items-center gap-1">
                    View & Export PDF <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
