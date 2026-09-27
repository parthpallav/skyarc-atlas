import { SCORING_FACTOR_CLIENT } from "./scoring-display.js";

export type ScoringFactorKey =
  | "VISIBILITY"
  | "AUDIENCE_FIT"
  | "COMMERCIAL_FIT"
  | "APPROACH_EXPOSURE"
  | "BRAND_SUITABILITY"
  | "VISUAL_COMPETITION"
  | "LOCATION_QUALITY"
  | "DATA_CONFIDENCE";

export type ScoringMethodologyFactor = {
  basis: string;
  dataSources: string[];
};

export type ScoringMethodology = {
  title: string;
  summary: string;
  versionLabel: string;
  trustNotes: string[];
  factors: Partial<Record<ScoringFactorKey, ScoringMethodologyFactor>>;
};

export const DEFAULT_SCORING_METHODOLOGY: ScoringMethodology = {
  title: "Skyarc Index",
  summary:
    "The Skyarc Index is a 0–100 location score built from field-verified site attributes. Each factor is scored independently, then combined with published weights so planners and brands can compare sites on a consistent Atlas standard.",
  versionLabel: "v1",
  trustNotes: [
    "Factor inputs are captured per site with confidence and evidence notes.",
    "Weights are controlled by Skyarc Superadmin and apply network-wide while active.",
    "Missing factors lower confidence and mark the Index incomplete until filled.",
  ],
  factors: {
    VISIBILITY: {
      basis: SCORING_FACTOR_CLIENT.VISIBILITY.description,
      dataSources: [
        "Approach / front photographs",
        "Field survey sightline notes",
        "Mounting height & setback",
      ],
    },
    APPROACH_EXPOSURE: {
      basis: SCORING_FACTOR_CLIENT.APPROACH_EXPOSURE.description,
      dataSources: [
        "Approach video or photos",
        "Junction / corridor classification",
        "Direction of traffic",
      ],
    },
    AUDIENCE_FIT: {
      basis: SCORING_FACTOR_CLIENT.AUDIENCE_FIT.description,
      dataSources: ["Corridor footfall class", "Adjacent land use", "Planner audience tags"],
    },
    BRAND_SUITABILITY: {
      basis: SCORING_FACTOR_CLIENT.BRAND_SUITABILITY.description,
      dataSources: ["Clutter context", "Premium corridor flag", "Historical brand category fit"],
    },
    COMMERCIAL_FIT: {
      basis: SCORING_FACTOR_CLIENT.COMMERCIAL_FIT.description,
      dataSources: ["Rate vs corridor benchmark", "Demand / hold history"],
    },
    VISUAL_COMPETITION: {
      basis: SCORING_FACTOR_CLIENT.VISUAL_COMPETITION.description,
      dataSources: ["Surrounding photo set", "Nearby face count estimate"],
    },
    LOCATION_QUALITY: {
      basis: SCORING_FACTOR_CLIENT.LOCATION_QUALITY.description,
      dataSources: ["Structure condition", "Lighting type", "Permit / mounting notes"],
    },
    DATA_CONFIDENCE: {
      basis: SCORING_FACTOR_CLIENT.DATA_CONFIDENCE.description,
      dataSources: ["Attribute confidence average", "Survey completeness", "Photo coverage"],
    },
  },
};

/** Attribute keys stored on LocationAttribute for each scoring factor. */
export const SCORING_FACTOR_ATTRIBUTE_KEY: Record<ScoringFactorKey, string> = {
  VISIBILITY: "visibility",
  AUDIENCE_FIT: "audience_fit",
  COMMERCIAL_FIT: "commercial_fit",
  APPROACH_EXPOSURE: "approach_exposure",
  BRAND_SUITABILITY: "brand_suitability",
  VISUAL_COMPETITION: "visual_competition",
  LOCATION_QUALITY: "location_quality",
  DATA_CONFIDENCE: "data_confidence",
};

export function parseScoringMethodology(raw: unknown): ScoringMethodology {
  if (!raw || typeof raw !== "object") return DEFAULT_SCORING_METHODOLOGY;
  const o = raw as Record<string, unknown>;
  const base = DEFAULT_SCORING_METHODOLOGY;
  return {
    title: typeof o.title === "string" && o.title.trim() ? o.title.trim() : base.title,
    summary: typeof o.summary === "string" && o.summary.trim() ? o.summary.trim() : base.summary,
    versionLabel:
      typeof o.versionLabel === "string" && o.versionLabel.trim()
        ? o.versionLabel.trim()
        : base.versionLabel,
    trustNotes: Array.isArray(o.trustNotes)
      ? o.trustNotes.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      : base.trustNotes,
    factors: {
      ...base.factors,
      ...(typeof o.factors === "object" && o.factors
        ? (o.factors as ScoringMethodology["factors"])
        : {}),
    },
  };
}
