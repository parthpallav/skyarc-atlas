export interface ClientFactorMeta {
  label: string;
  shortLabel: string;
  description: string;
  /** Short pitch line under Index bars — never prefixed with “Supports”. */
  clientOutcome: string;
}

/** Client-facing labels for DOOH plan presentations. */
export const SCORING_FACTOR_CLIENT = {
  VISIBILITY: {
    label: "Visibility",
    shortLabel: "Visibility",
    description: "How clearly the face is seen from passing traffic",
    clientOutcome: "Clear read from passing traffic",
  },
  APPROACH_EXPOSURE: {
    label: "Awareness",
    shortLabel: "Awareness",
    description: "Exposure on approach routes and junction sightlines",
    clientOutcome: "Strong approach and junction sightlines",
  },
  AUDIENCE_FIT: {
    label: "Audience reach",
    shortLabel: "Audience",
    description: "Fit with target audience traffic patterns",
    clientOutcome: "Aligned with target traffic patterns",
  },
  BRAND_SUITABILITY: {
    label: "Brand recall potential",
    shortLabel: "Recall",
    description: "Suitability for building aided brand recall",
    clientOutcome: "Built for aided brand recall",
  },
  COMMERCIAL_FIT: {
    label: "Commercial impact",
    shortLabel: "Commercial",
    description: "Expected commercial value for the investment",
    clientOutcome: "Solid value for the spend",
  },
  VISUAL_COMPETITION: {
    label: "Clutter score",
    shortLabel: "Clutter",
    description: "Visual competition from nearby hoardings (higher = less clutter)",
    clientOutcome: "Low clutter, message stands out",
  },
  LOCATION_QUALITY: {
    label: "Site quality",
    shortLabel: "Quality",
    description: "Overall location and mounting quality",
    clientOutcome: "Premium site and mounting quality",
  },
  DATA_CONFIDENCE: {
    label: "Data confidence",
    shortLabel: "Confidence",
    description: "Confidence in the underlying survey data",
    clientOutcome: "Survey data you can trust",
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

/** Pitch-safe strength chip for Index factors. */
export function factorBandLabel(band: "high" | "medium" | "low"): string {
  if (band === "high") return "Strong";
  if (band === "medium") return "Solid";
  return "Soft";
}

/**
 * One-line Index caption for plan UI — no “Supports …” boilerplate.
 * Prefers the curated outcome; softens wording when the band is low.
 */
export function factorPitchCaption(metric: {
  band: "high" | "medium" | "low";
  clientOutcome: string;
  shortLabel?: string;
}): string {
  const line = (metric.clientOutcome ?? "").trim();
  if (!line) {
    const label = (metric.shortLabel ?? "this factor").trim();
    if (metric.band === "high") return `Strong ${label.toLowerCase()}`;
    if (metric.band === "medium") return `Steady ${label.toLowerCase()}`;
    return `Room to improve ${label.toLowerCase()}`;
  }
  if (metric.band === "low") return `Watch: ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
  return line;
}
