"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Layers,
  MapPin,
  Share2,
  Sparkles,
  Target,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/hooks/use-permissions";
import { canViewClientPricing } from "@skyarc/shared";
import { trackEntityView, trackBusinessEvent } from "@/lib/clarity-telemetry";
import {
  PlanSummaryCards,
  SiteMetricsBars,
  type PlanSummaryView,
  type SiteInsightsView,
} from "@/components/media-plan-insights";
import { MediaPlanDetailSkeleton } from "@/components/ui/skeleton";

interface PlanItemRow {
  id: string;
  rank: number | null;
  budgetAllocated: number;
  explanationText?: string | null;
  pricing?: {
    vendorRate?: number;
    clientRate?: number;
    impliedMarginPercent?: number;
    skyarcRevenue?: number;
  };
  location?: {
    id: string;
    name: string;
    road?: string | null;
    junction?: string | null;
    coverImageUrl?: string | null;
  };
  insights?: SiteInsightsView;
}

interface MediaPlanDetail {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  createdAt: string;
  _count?: { items: number };
  summary?: PlanSummaryView;
  items: PlanItemRow[];
}

// Generate creative marketing highlights for client pitch view (no numeric scores)
function getCreativeHighlights(item: PlanItemRow, index: number): string[] {
  const highlights: string[] = [];
  const road = (item.location?.road ?? "").toLowerCase();
  const name = (item.location?.name ?? "").toLowerCase();

  if (road.includes("150") || road.includes("ring")) {
    highlights.push("Prime Arterial Ring Road — Heavy Commuter Flow");
  } else if (road.includes("kalawad")) {
    highlights.push("Premium Commercial & Education Corridor");
  } else if (road.includes("amin") || road.includes("yagnik") || road.includes("astron")) {
    highlights.push("High-Income Retail & Lifestyle District");
  } else {
    highlights.push("High Dwell Time Major Junction");
  }

  if (index % 2 === 0) {
    highlights.push("Unobstructed 200m+ Long-Distance Visibility");
    highlights.push("Dominant Night-Time Backlit Brand Recall");
  } else {
    highlights.push("Prime Eye-Level Vehicular Line of Sight");
    highlights.push("High Repeat Audience Exposure");
  }

  return highlights;
}

export default function MediaPlanDetailPage() {
  const params = useParams<{ id: string; planId: string }>();
  const campaignId = params.id;
  const planId = params.planId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authUser } = usePermissions();
  const canExportPdf = authUser ? canViewClientPricing(authUser) : false;

  const [viewMode, setViewMode] = useState<"customer" | "internal">("customer");
  const [copiedLink, setCopiedLink] = useState(false);

  const {
    data: plan,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["media-plan", campaignId, planId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getMediaPlan(campaignId, planId);
      return result.data as MediaPlanDetail;
    },
  });

  useEffect(() => {
    if (plan) {
      trackEntityView("media_plan", {
        id: plan.id,
        name: plan.name,
        status: plan.status,
        totalBudget: plan.totalBudget ?? undefined,
        itemCount: plan.items.length,
      });
    }
  }, [plan]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.deleteMediaPlan(campaignId, planId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      router.push(`/campaigns/${campaignId}`);
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      trackBusinessEvent("export_media_plan_pdf", { planId, campaignId });
      return client.exportMediaPlanPdf(campaignId, planId);
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${plan?.name ?? "media-plan"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  function handleCopyShareLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  }

  if (isLoading) {
    return <MediaPlanDetailSkeleton />;
  }

  if (isError || !plan) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">
          {loadError instanceof Error ? loadError.message : "Media plan not found"}
        </p>
        <Link href={`/campaigns/${campaignId}`} className="text-primary hover:underline text-sm font-medium">
          Back to campaign
        </Link>
      </div>
    );
  }

  const totalAllocated = plan.items.reduce((sum, item) => sum + item.budgetAllocated, 0);

  return (
    <div className="max-w-5xl mx-auto w-full pb-16 space-y-6">
      <Link
        href={`/campaigns/${campaignId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-2 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaign
      </Link>

      <PageHeader
        title={plan.name}
        description={`OOH Campaign Media Plan · ${plan.status}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="btn-secondary text-xs gap-1.5 py-2 px-3 shadow-xs"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-primary" />
                  Share Proposal Link
                </>
              )}
            </button>

            {canExportPdf && (
              <button
                type="button"
                className="btn-primary text-xs gap-2 py-2 px-3.5 shadow-sm"
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
              >
                <Download className="w-4 h-4" />
                {exportMutation.isPending ? "Exporting…" : "Export Pitch Deck (PDF)"}
              </button>
            )}

            <button
              type="button"
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              title="Delete plan"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* View Mode Toggle: Customer Visual Presentation vs Internal Analytics */}
      <div className="flex items-center justify-between p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setViewMode("customer")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            viewMode === "customer"
              ? "bg-white text-primary shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          Customer Presentation Mode (Visual Brand Pitch)
        </button>

        <button
          type="button"
          onClick={() => setViewMode("internal")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            viewMode === "internal"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="w-4 h-4 text-slate-500" />
          Internal Planner & Scoring Analytics
        </button>
      </div>

      {exportMutation.isError && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {exportMutation.error instanceof Error ? exportMutation.error.message : "Failed to export PDF"}
        </p>
      )}

      {/* CUSTOMER FACING VISUAL PRESENTATION MODE */}
      {viewMode === "customer" ? (
        <div className="space-y-6">
          {/* Executive Campaign Visual Banner */}
          <div className="rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-primary/90 text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="relative z-10 space-y-4 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-white/10 text-violet-200 backdrop-blur-sm border border-white/10">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Curated Brand Media Plan
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {plan.name}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                A strategically allocated out-of-home media proposal engineered for high dwell times, prime commuter corridors, and maximum brand awareness across Rajkot.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Total Sites</span>
                  <span className="text-xl font-bold text-white">{plan.items.length} Prime Locations</span>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Total Investment</span>
                  <span className="text-xl font-bold text-emerald-400">{formatInr(totalAllocated)}</span>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10">
                  <span className="text-[10px] text-zinc-400 uppercase font-semibold block">Audience Reach</span>
                  <span className="text-xl font-bold text-violet-300">~450k+ Daily Footfall</span>
                </div>
              </div>
            </div>
          </div>

          {/* Creative Strategic Placement Cards (No technical scores) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Curated Media Sites</h3>
                <p className="text-xs text-muted">
                  High-impact billboard locations aligned with your target campaign corridors
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {plan.items.map((item, idx) => {
                const highlights = getCreativeHighlights(item, idx);
                const clientPrice = item.pricing?.clientRate ?? item.budgetAllocated;

                return (
                  <div
                    key={item.id}
                    className="card-surface overflow-hidden flex flex-col justify-between border-violet-100 hover:border-primary/50 transition-all hover:shadow-lg group"
                  >
                    <div>
                      {/* High Resolution Site Photo */}
                      <div className="relative h-56 bg-slate-900 overflow-hidden">
                        {item.location?.coverImageUrl ? (
                          <Image
                            src={item.location.coverImageUrl}
                            alt={item.location.name}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 768px) 100vw, 50vw"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2 bg-gradient-to-br from-slate-900 to-zinc-800">
                            <MapPin className="w-8 h-8 opacity-50" />
                            <span className="text-xs font-semibold">Rajkot Prime Hoarding Site</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

                        {/* Location Rank Badge */}
                        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md text-white text-xs font-extrabold px-3 py-1 rounded-full border border-white/20">
                          Site #{idx + 1}
                        </div>

                        {/* Corridor Pill */}
                        <div className="absolute top-3 right-3 bg-primary/90 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-sm backdrop-blur-md">
                          {item.location?.road ?? "Prime Corridor"}
                        </div>

                        {/* Site Name on Image */}
                        <div className="absolute bottom-3 left-3 right-3 text-white">
                          <h4 className="font-bold text-base line-clamp-1 drop-shadow-sm">
                            {item.location?.name}
                          </h4>
                          <p className="text-xs text-zinc-300 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">{item.location?.junction ?? item.location?.road}</span>
                          </p>
                        </div>
                      </div>

                      {/* Creative Marketing Rationale (Selling Points) */}
                      <div className="p-5 space-y-3">
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted block">
                            Strategic Placement Value
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {highlights.map((h, hIdx) => (
                              <span
                                key={hIdx}
                                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-violet-50 text-slate-800 border border-violet-100"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                {h}
                              </span>
                            ))}
                          </div>
                        </div>

                        {item.explanationText && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 italic leading-relaxed">
                            &ldquo;{item.explanationText}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer with Monthly Client Rate & Details */}
                    <div className="p-4 bg-slate-50/70 border-t border-violet-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-muted uppercase font-semibold block">
                          Client Rate (Monthly)
                        </span>
                        <span className="text-base font-extrabold text-slate-900">
                          {formatInr(clientPrice)}
                          <span className="text-xs font-normal text-muted"> /month</span>
                        </span>
                      </div>

                      {item.location && (
                        <Link
                          href={`/locations/${item.location.id}`}
                          className="btn-secondary text-xs gap-1 py-1.5 px-3"
                        >
                          View Site Details →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* INTERNAL ANALYTICS & SCORING VIEW */
        <div className="space-y-6">
          <section className="card-surface p-5 sm:p-6">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-muted font-medium">Total budget</dt>
                <dd className="text-slate-900 mt-0.5 font-semibold">
                  {plan.totalBudget != null ? formatInr(plan.totalBudget) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted font-medium">Allocated</dt>
                <dd className="text-slate-900 mt-0.5 font-semibold">{formatInr(totalAllocated)}</dd>
              </div>
              <div>
                <dt className="text-muted font-medium">Sites</dt>
                <dd className="text-slate-900 mt-0.5 font-semibold">
                  {plan._count?.items ?? plan.items.length}
                </dd>
              </div>
            </dl>
          </section>

          {plan.summary && plan.summary.siteCount > 0 && (
            <PlanSummaryCards summary={plan.summary} />
          )}

          <section className="card-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-violet-100">
              <h2 className="font-semibold text-slate-900">Internal Placements & Rate Breakdown</h2>
              <p className="text-xs text-muted mt-1">
                Vendor net B2B costs, client customer rates, and algorithm factor scores.
              </p>
            </div>

            <ul className="divide-y divide-violet-50">
              {plan.items.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex gap-4">
                    {item.location?.coverImageUrl ? (
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-violet-100">
                        <Image
                          src={item.location.coverImageUrl}
                          alt={item.location.name}
                          fill
                          className="object-cover"
                          sizes="96px"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-xs text-muted">
                        No photo
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <Link
                            href={item.location ? `/locations/${item.location.id}` : "#"}
                            className="font-semibold text-slate-900 hover:text-primary truncate block"
                          >
                            #{item.rank ?? "—"} {item.location?.name ?? "Unknown site"}
                          </Link>
                          {item.location?.road && (
                            <p className="text-xs text-muted truncate">{item.location.road}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatInr(item.budgetAllocated)}
                          </p>
                          {item.pricing && (
                            <div className="mt-1 text-xs text-muted space-y-0.5">
                              {item.pricing.vendorRate != null && (
                                <p>Vendor Net: {formatInr(item.pricing.vendorRate)}</p>
                              )}
                              {item.pricing.clientRate != null ? (
                                <p className="text-slate-900 font-medium">
                                  Client Rate: {formatInr(item.pricing.clientRate)}
                                </p>
                              ) : (
                                <p className="text-amber-700">Client price not set</p>
                              )}
                              {item.pricing.impliedMarginPercent != null &&
                                item.pricing.skyarcRevenue != null && (
                                  <p className="text-emerald-700 font-medium">
                                    Margin {item.pricing.impliedMarginPercent}% (
                                    {formatInr(item.pricing.skyarcRevenue)})
                                  </p>
                                )}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.insights && (
                        <div className="mt-3 pt-3 border-t border-violet-50">
                          <SiteMetricsBars metrics={item.insights.metrics} />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
