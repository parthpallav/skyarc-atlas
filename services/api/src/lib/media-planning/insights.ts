import {
  PLAN_HIGHLIGHT_FACTORS,
  SCORING_FACTOR_CLIENT,
  ScoringFactor,
  ScoreStatus,
  scoreBand,
  type ClientFactorMeta,
} from "@skyarc/shared";

export interface SiteMetric {
  factor: string;
  label: string;
  shortLabel: string;
  score: number;
  band: "high" | "medium" | "low";
  clientOutcome: string;
}

export interface SiteInsights {
  overallScore: number;
  overallConfidence: number;
  metrics: SiteMetric[];
  highlights: string[];
  explanationText: string;
}

export interface PlanSummary {
  siteCount: number;
  avgOverallScore: number;
  avgVisibility: number;
  avgAwareness: number;
  avgRecallPotential: number;
  avgAudienceReach: number;
  strengths: string[];
}

interface ScoreComponentRow {
  factor?: string;
  score?: number;
  confidence?: number;
  status?: string;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function attrNumber(attrs: Record<string, unknown>, key: string, fallback: number): number {
  const v = attrs[key];
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}

/** Heuristic factor scores when full AI attributes are not yet available. */
export function estimateFactorScores(input: {
  sqft?: number;
  lightingType?: string | null;
  road?: string | null;
}): Record<string, number> {
  const sqft = input.sqft ?? 400;
  const light = (input.lightingType ?? "").toLowerCase();
  const road = (input.road ?? "").toLowerCase();

  let visibility = 58;
  if (sqft >= 400) visibility += 18;
  else if (sqft >= 300) visibility += 12;
  else if (sqft >= 200) visibility += 6;
  if (light.includes("back")) visibility += 10;
  if (light.includes("front")) visibility += 4;

  let approach = 55;
  if (road.includes("ring") || road.includes("marg") || road.includes("road")) approach += 15;
  if (road.includes("kalawad") || road.includes("university")) approach += 8;

  const audience = clampScore(52 + Math.min(25, sqft / 20));
  const brand = clampScore(visibility * 0.55 + approach * 0.45);
  const commercial = clampScore(50 + sqft / 12);
  const clutter = clampScore(68 - (road.includes("ring") ? 8 : 0));
  const quality = clampScore(55 + sqft / 25);

  return {
    visibility: clampScore(visibility),
    approach_exposure: clampScore(approach),
    audience_fit: audience,
    brand_suitability: brand,
    commercial_fit: commercial,
    visual_competition: clutter,
    location_quality: quality,
    data_confidence: 65,
  };
}

const FACTOR_TO_ATTR: Record<string, string> = {
  [ScoringFactor.VISIBILITY]: "visibility",
  [ScoringFactor.AUDIENCE_FIT]: "audience_fit",
  [ScoringFactor.COMMERCIAL_FIT]: "commercial_fit",
  [ScoringFactor.APPROACH_EXPOSURE]: "approach_exposure",
  [ScoringFactor.BRAND_SUITABILITY]: "brand_suitability",
  [ScoringFactor.VISUAL_COMPETITION]: "visual_competition",
  [ScoringFactor.LOCATION_QUALITY]: "location_quality",
  [ScoringFactor.DATA_CONFIDENCE]: "data_confidence",
};

function factorMeta(factor: string): ClientFactorMeta {
  const key = factor as keyof typeof SCORING_FACTOR_CLIENT;
  return SCORING_FACTOR_CLIENT[key] ?? {
    label: factor,
    shortLabel: factor,
    description: factor,
    clientOutcome: factor,
  };
}

export function resolveFactorScores(
  attributes: Record<string, unknown>,
  componentsJson: unknown,
  road?: string | null
): Record<string, number> {
  const fromAttrs: Record<string, number> = {};
  for (const [, attrKey] of Object.entries(FACTOR_TO_ATTR)) {
    const v = attrNumber(attributes, attrKey, NaN);
    if (!Number.isNaN(v)) fromAttrs[attrKey] = clampScore(v);
  }
  if (Object.keys(fromAttrs).length >= 4) return fromAttrs;

  if (Array.isArray(componentsJson)) {
    const fromComponents: Record<string, number> = {};
    for (const row of componentsJson as ScoreComponentRow[]) {
      if (!row.factor || row.score == null) continue;
      const attrKey = FACTOR_TO_ATTR[row.factor] ?? row.factor.toLowerCase();
      fromComponents[attrKey] = clampScore(row.score);
    }
    if (Object.keys(fromComponents).length >= 4) return fromComponents;
  }

  return estimateFactorScores({
    sqft: attrNumber(attributes, "sqft", 400),
    lightingType:
      typeof attributes.lighting_type === "string" ? attributes.lighting_type : null,
    road: road ?? (typeof attributes.road_hint === "string" ? attributes.road_hint : null),
  });
}

export function buildSiteInsights(input: {
  rank: number;
  locationName: string;
  road?: string | null;
  budgetAllocated: number;
  overallScore: number;
  overallConfidence?: number;
  attributes: Record<string, unknown>;
  componentsJson?: unknown;
}): SiteInsights {
  const factorScores = resolveFactorScores(
    input.attributes,
    input.componentsJson ?? null,
    input.road
  );
  const metrics: SiteMetric[] = PLAN_HIGHLIGHT_FACTORS.map((factor) => {
    const attrKey = FACTOR_TO_ATTR[factor];
    const meta = factorMeta(factor);
    const score = factorScores[attrKey] ?? 0;
    return {
      factor,
      label: meta.label,
      shortLabel: meta.shortLabel,
      score,
      band: scoreBand(score),
      clientOutcome: meta.clientOutcome,
    };
  });

  const top = [...metrics].sort((a, b) => b.score - a.score).slice(0, 2);
  const roadLabel = input.road ? ` on ${input.road}` : "";
  const highlights = top.map(
    (m) => `${m.label}: ${m.score}/100 (${m.band}) — supports ${m.clientOutcome}`
  );

  const explanationText = [
    `Rank #${input.rank}${roadLabel}.`,
    `Overall fit ${Math.round(input.overallScore)}/100.`,
    `Strong ${top[0]?.label.toLowerCase() ?? "visibility"} (${top[0]?.score ?? 0}/100)`,
    top[1] ? `and ${top[1].label.toLowerCase()} (${top[1].score}/100)` : "",
    `support ${top[0]?.clientOutcome ?? "campaign impact"} for this plan.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    overallScore: input.overallScore,
    overallConfidence: input.overallConfidence ?? 0.65,
    metrics,
    highlights,
    explanationText,
  };
}

export function buildPlanSummary(items: SiteInsights[]): PlanSummary {
  if (items.length === 0) {
    return {
      siteCount: 0,
      avgOverallScore: 0,
      avgVisibility: 0,
      avgAwareness: 0,
      avgRecallPotential: 0,
      avgAudienceReach: 0,
      strengths: [],
    };
  }

  const avg = (pick: (m: SiteMetric[]) => number) => {
    const values = items.map((item) => pick(item.metrics));
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  };

  const metric = (factor: string) => (metrics: SiteMetric[]) =>
    metrics.find((m) => m.factor === factor)?.score ?? 0;

  const avgVisibility = avg(metric(ScoringFactor.VISIBILITY));
  const avgAwareness = avg(metric(ScoringFactor.APPROACH_EXPOSURE));
  const avgRecall = avg(metric(ScoringFactor.BRAND_SUITABILITY));
  const avgAudience = avg(metric(ScoringFactor.AUDIENCE_FIT));
  const avgOverall = Math.round(
    items.reduce((s, i) => s + i.overallScore, 0) / items.length
  );

  const strengths: string[] = [];
  if (avgVisibility >= 70) strengths.push("High average visibility across selected sites");
  if (avgAwareness >= 70) strengths.push("Strong awareness potential on approach routes");
  if (avgRecall >= 68) strengths.push("Good brand recall potential for FMCG / launch campaigns");
  if (avgAudience >= 65) strengths.push("Solid audience reach for mass-market targeting");
  if (strengths.length === 0) {
    strengths.push("Balanced mix of sites optimized for budget and location scores");
  }

  return {
    siteCount: items.length,
    avgOverallScore: avgOverall,
    avgVisibility,
    avgAwareness,
    avgRecallPotential: avgRecall,
    avgAudienceReach: avgAudience,
    strengths,
  };
}

export function buildScoreComponentsFromFactors(
  factorScores: Record<string, number>
): Array<{
  factor: string;
  score: number;
  confidence: number;
  status: string;
  evidence: string[];
}> {
  const reverseMap = Object.fromEntries(
    Object.entries(FACTOR_TO_ATTR).map(([factor, attr]) => [attr, factor])
  );

  return Object.entries(factorScores).map(([attrKey, score]) => ({
    factor: reverseMap[attrKey] ?? attrKey.toUpperCase(),
    score,
    confidence: 0.65,
    status: ScoreStatus.COMPUTED,
    evidence: ["estimated from site survey attributes"],
  }));
}
