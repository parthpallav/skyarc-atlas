export type LocationScoringScenario = {
  /** Short label for this site's scoring situation, e.g. "Ring Road unipole — outbound city face". */
  scenarioTitle: string;
  /** Why this site's Index looks the way it does — site-specific, not network-generic. */
  scenarioSummary: string;
  /** Extra trust bullets unique to this location. */
  trustNotes: string[];
};

export const EMPTY_LOCATION_SCORING: LocationScoringScenario = {
  scenarioTitle: "",
  scenarioSummary: "",
  trustNotes: [],
};

export function parseLocationScoring(raw: unknown): LocationScoringScenario {
  if (!raw || typeof raw !== "object") return { ...EMPTY_LOCATION_SCORING };
  const o = raw as Record<string, unknown>;
  return {
    scenarioTitle:
      typeof o.scenarioTitle === "string" ? o.scenarioTitle.trim() : "",
    scenarioSummary:
      typeof o.scenarioSummary === "string" ? o.scenarioSummary.trim() : "",
    trustNotes: Array.isArray(o.trustNotes)
      ? o.trustNotes.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
      : [],
  };
}
