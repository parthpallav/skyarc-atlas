import type { ScoringFactorKey } from "./scoring-methodology.js";

export type ScoringReasonBand = "high" | "medium" | "low";

export type ScoringReasonPreset = {
  id: string;
  factor: ScoringFactorKey;
  label: string;
  /** Suggested score when this reason is selected (admin can still override). */
  suggestedScore: number;
  band: ScoringReasonBand;
};

/** Predefined evidence / reasons admins pick when scoring a site. */
export const SCORING_REASON_PRESETS: ScoringReasonPreset[] = [
  // Visibility
  {
    id: "vis_long_sightline",
    factor: "VISIBILITY",
    label: "Long clear sightline (100m+)",
    suggestedScore: 90,
    band: "high",
  },
  {
    id: "vis_eye_level",
    factor: "VISIBILITY",
    label: "Eye-level / driver line-of-sight",
    suggestedScore: 85,
    band: "high",
  },
  {
    id: "vis_lit_night",
    factor: "VISIBILITY",
    label: "Well lit for night read",
    suggestedScore: 80,
    band: "high",
  },
  {
    id: "vis_partial_obstruction",
    factor: "VISIBILITY",
    label: "Partial obstruction (trees / poles)",
    suggestedScore: 55,
    band: "medium",
  },
  {
    id: "vis_angle_compromise",
    factor: "VISIBILITY",
    label: "Oblique angle / short dwell",
    suggestedScore: 45,
    band: "low",
  },
  {
    id: "vis_blocked_peak",
    factor: "VISIBILITY",
    label: "Blocked in peak traffic lanes",
    suggestedScore: 30,
    band: "low",
  },

  // Awareness / approach
  {
    id: "aw_signal_hold",
    factor: "APPROACH_EXPOSURE",
    label: "Signal / junction hold with long dwell",
    suggestedScore: 90,
    band: "high",
  },
  {
    id: "aw_arterial_approach",
    factor: "APPROACH_EXPOSURE",
    label: "Primary arterial approach face",
    suggestedScore: 85,
    band: "high",
  },
  {
    id: "aw_dual_direction",
    factor: "APPROACH_EXPOSURE",
    label: "Readable on dual-direction approach",
    suggestedScore: 75,
    band: "high",
  },
  {
    id: "aw_secondary_feeder",
    factor: "APPROACH_EXPOSURE",
    label: "Secondary feeder / side approach",
    suggestedScore: 55,
    band: "medium",
  },
  {
    id: "aw_short_approach",
    factor: "APPROACH_EXPOSURE",
    label: "Short approach window",
    suggestedScore: 40,
    band: "low",
  },

  // Audience
  {
    id: "aud_premium_corridor",
    factor: "AUDIENCE_FIT",
    label: "Premium retail / office corridor",
    suggestedScore: 90,
    band: "high",
  },
  {
    id: "aud_high_otc",
    factor: "AUDIENCE_FIT",
    label: "High OTC / dense traffic class",
    suggestedScore: 85,
    band: "high",
  },
  {
    id: "aud_mass_reach",
    factor: "AUDIENCE_FIT",
    label: "Mass reach residential–commercial mix",
    suggestedScore: 70,
    band: "medium",
  },
  {
    id: "aud_niche_catchment",
    factor: "AUDIENCE_FIT",
    label: "Niche catchment only",
    suggestedScore: 50,
    band: "medium",
  },
  {
    id: "aud_low_footfall",
    factor: "AUDIENCE_FIT",
    label: "Low footfall / low throughput",
    suggestedScore: 35,
    band: "low",
  },

  // Brand recall
  {
    id: "br_solus_impact",
    factor: "BRAND_SUITABILITY",
    label: "Solus / dominant face for brand standout",
    suggestedScore: 90,
    band: "high",
  },
  {
    id: "br_large_canvas",
    factor: "BRAND_SUITABILITY",
    label: "Large canvas for brand storytelling",
    suggestedScore: 85,
    band: "high",
  },
  {
    id: "br_premium_context",
    factor: "BRAND_SUITABILITY",
    label: "Premium neighbourhood context",
    suggestedScore: 80,
    band: "high",
  },
  {
    id: "br_cluttered_cluster",
    factor: "BRAND_SUITABILITY",
    label: "Clustered with competing brands",
    suggestedScore: 45,
    band: "low",
  },
  {
    id: "br_format_constraint",
    factor: "BRAND_SUITABILITY",
    label: "Format limits creative impact",
    suggestedScore: 40,
    band: "low",
  },

  // Commercial
  {
    id: "com_strong_roi",
    factor: "COMMERCIAL_FIT",
    label: "Strong rate-to-impact value",
    suggestedScore: 85,
    band: "high",
  },
  {
    id: "com_demand_history",
    factor: "COMMERCIAL_FIT",
    label: "Consistent booking / demand history",
    suggestedScore: 80,
    band: "high",
  },
  {
    id: "com_fair_market",
    factor: "COMMERCIAL_FIT",
    label: "Fair market rate for corridor",
    suggestedScore: 65,
    band: "medium",
  },
  {
    id: "com_premium_price",
    factor: "COMMERCIAL_FIT",
    label: "Premium-priced vs peers",
    suggestedScore: 45,
    band: "low",
  },

  // Clutter (higher score = less clutter)
  {
    id: "cl_clean_vista",
    factor: "VISUAL_COMPETITION",
    label: "Clean vista — little competing OOH",
    suggestedScore: 90,
    band: "high",
  },
  {
    id: "cl_moderate_peers",
    factor: "VISUAL_COMPETITION",
    label: "Moderate nearby faces",
    suggestedScore: 60,
    band: "medium",
  },
  {
    id: "cl_heavy_clutter",
    factor: "VISUAL_COMPETITION",
    label: "Heavy OOH clutter on same stretch",
    suggestedScore: 30,
    band: "low",
  },

  // Site quality
  {
    id: "ql_premium_structure",
    factor: "LOCATION_QUALITY",
    label: "Premium structure / mounting",
    suggestedScore: 90,
    band: "high",
  },
  {
    id: "ql_good_condition",
    factor: "LOCATION_QUALITY",
    label: "Good condition, maintained face",
    suggestedScore: 75,
    band: "high",
  },
  {
    id: "ql_average_build",
    factor: "LOCATION_QUALITY",
    label: "Average build quality",
    suggestedScore: 55,
    band: "medium",
  },
  {
    id: "ql_wear_visible",
    factor: "LOCATION_QUALITY",
    label: "Visible wear / maintenance risk",
    suggestedScore: 35,
    band: "low",
  },

  // Data confidence
  {
    id: "dc_photo_verified",
    factor: "DATA_CONFIDENCE",
    label: "Field photos / approach video verified",
    suggestedScore: 90,
    band: "high",
  },
  {
    id: "dc_survey_complete",
    factor: "DATA_CONFIDENCE",
    label: "Full survey attributes captured",
    suggestedScore: 85,
    band: "high",
  },
  {
    id: "dc_partial_survey",
    factor: "DATA_CONFIDENCE",
    label: "Partial survey — some gaps",
    suggestedScore: 55,
    band: "medium",
  },
  {
    id: "dc_estimate_only",
    factor: "DATA_CONFIDENCE",
    label: "Estimate only — limited field proof",
    suggestedScore: 35,
    band: "low",
  },
];

export type SiteScenarioPreset = {
  id: string;
  label: string;
  summary: string;
};

/** Predefined site scenario templates (admin can still edit text). */
export const SITE_SCENARIO_PRESETS: SiteScenarioPreset[] = [
  {
    id: "ring_outbound",
    label: "Ring Road unipole — outbound city face",
    summary:
      "High-speed ring corridor with strong outbound visibility and premium brand canvas for city-bound traffic.",
  },
  {
    id: "arterial_junction",
    label: "Arterial junction — signal dwell",
    summary:
      "Primary arterial junction with signal hold; strong awareness and dwell for brand messaging.",
  },
  {
    id: "retail_stretch",
    label: "Retail corridor hoarding",
    summary:
      "Dense retail stretch with high audience fit; score reflects footfall mix and competing faces nearby.",
  },
  {
    id: "residential_feeder",
    label: "Residential feeder / community face",
    summary:
      "Local feeder context — solid neighbourhood reach with moderate throughput versus arterials.",
  },
  {
    id: "highway_approach",
    label: "Highway / city entry approach",
    summary:
      "City entry or highway approach face — long sightline and strong top-of-funnel awareness.",
  },
  {
    id: "transit_adjacent",
    label: "Transit-adjacent / BQS context",
    summary:
      "Transit-adjacent inventory with captive dwell; audience skew depends on route and stop class.",
  },
];

export function scoringReasonsForFactor(factor: string): ScoringReasonPreset[] {
  return SCORING_REASON_PRESETS.filter((r) => r.factor === factor);
}

export function scoringReasonById(id: string): ScoringReasonPreset | undefined {
  return SCORING_REASON_PRESETS.find((r) => r.id === id);
}

/** Average suggested scores for selected reason ids (rounded). */
export function suggestedScoreFromReasonIds(ids: string[]): number | null {
  const scores = ids
    .map((id) => scoringReasonById(id)?.suggestedScore)
    .filter((n): n is number => typeof n === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function parseEvidenceReasonIds(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const ids = (raw as { reasonIds?: unknown }).reasonIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}
