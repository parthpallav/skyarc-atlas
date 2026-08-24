export interface ClientFactorMeta {
  label: string;
  shortLabel: string;
  description: string;
  clientOutcome: string;
}

/** Client-facing labels for DOOH plan presentations. */
export const SCORING_FACTOR_CLIENT = {
  VISIBILITY: {
    label: "Visibility",
    shortLabel: "Visibility",
    description: "How clearly the face is seen from passing traffic",
    clientOutcome: "brand visibility",
  },
  APPROACH_EXPOSURE: {
    label: "Awareness",
    shortLabel: "Awareness",
    description: "Exposure on approach routes and junction sightlines",
    clientOutcome: "top-of-mind awareness",
  },
  AUDIENCE_FIT: {
    label: "Audience reach",
    shortLabel: "Audience",
    description: "Fit with target audience traffic patterns",
    clientOutcome: "audience reach",
  },
  BRAND_SUITABILITY: {
    label: "Brand recall potential",
    shortLabel: "Recall",
    description: "Suitability for building aided brand recall",
    clientOutcome: "brand recall",
  },
  COMMERCIAL_FIT: {
    label: "Commercial impact",
    shortLabel: "Commercial",
    description: "Expected commercial value for the investment",
    clientOutcome: "commercial ROI",
  },
  VISUAL_COMPETITION: {
    label: "Clutter score",
    shortLabel: "Clutter",
    description: "Visual competition from nearby hoardings (higher = less clutter)",
    clientOutcome: "message standout",
  },
  LOCATION_QUALITY: {
    label: "Site quality",
    shortLabel: "Quality",
    description: "Overall location and mounting quality",
    clientOutcome: "premium placement",
  },
  DATA_CONFIDENCE: {
    label: "Data confidence",
    shortLabel: "Confidence",
    description: "Confidence in the underlying survey data",
    clientOutcome: "plan reliability",
  },
} as const satisfies Record<string, ClientFactorMeta>;

export const PLAN_HIGHLIGHT_FACTORS = [
  "VISIBILITY",
  "APPROACH_EXPOSURE",
  "BRAND_SUITABILITY",
  "AUDIENCE_FIT",
] as const;

export function scoreBand(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}
