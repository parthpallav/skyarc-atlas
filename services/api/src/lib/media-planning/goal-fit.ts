export interface CampaignGoal {
  objective?: string;
  /** Corridor / arterial road names */
  geographicFocus?: string[];
  cities?: string[];
  states?: string[];
  kpis?: string[];
  budget?: number;
  maxLocations?: number;
}

export interface GoalFitSite {
  inventoryId: string;
  locationId: string;
  locationName: string;
  skyarcSiteCode?: string | null;
  road: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  overallScore: number;
  rateAmount: number;
  inventoryType?: string | null;
  lighting?: string | null;
  factors: Record<string, number>;
}

export interface GoalAlternative {
  inventoryId: string;
  locationId: string;
  locationName: string;
  skyarcSiteCode?: string | null;
  road: string | null;
  score: number;
  goalFit: number;
  fitReason: string;
  rateAmount?: number;
  inventoryType?: string | null;
  lighting?: string | null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function norm(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function listHas(list: string[] | undefined, value?: string | null): boolean {
  if (!list?.length || !value?.trim()) return false;
  const token = norm(value);
  return list.some((item) => {
    const needle = norm(item);
    return needle.length > 0 && (token === needle || token.includes(needle) || needle.includes(token));
  });
}

function textHaystack(site: GoalFitSite): string {
  return `${site.locationName} ${site.road ?? ""}`.toLowerCase();
}

function corridorMatch(site: GoalFitSite, focus: string[]): boolean {
  if (focus.length === 0) return false;
  const hay = textHaystack(site);
  return focus.some((item) => {
    const token = item.toLowerCase().trim();
    return token.length > 2 && hay.includes(token);
  });
}

export function hasGeoConstraints(goal: CampaignGoal): boolean {
  return (
    (goal.cities?.length ?? 0) +
      (goal.states?.length ?? 0) +
      (goal.geographicFocus?.length ?? 0) >
    0
  );
}

/** Hard gate for optimizer pool when brief defines geography (inclusive OR). */
export function matchesPlanningGeography(site: GoalFitSite, goal: CampaignGoal): boolean {
  if (!hasGeoConstraints(goal)) return true;
  if (listHas(goal.cities, site.city)) return true;
  if (listHas(goal.states, site.state)) return true;
  if (listHas(goal.geographicFocus, site.city)) return true;
  if (corridorMatch(site, goal.geographicFocus ?? [])) return true;
  return false;
}

/** Inclusive OR across city, state, and corridor tokens. */
function geoSpecific(site: GoalFitSite, goal: CampaignGoal): { score: number; hit: boolean } {
  if (!hasGeoConstraints(goal)) return { score: 70, hit: false };
  const cityHit = listHas(goal.cities, site.city);
  const stateHit = listHas(goal.states, site.state);
  const corridorHit = corridorMatch(site, goal.geographicFocus ?? []);
  const hit = cityHit || stateHit || corridorHit;
  return { score: hit ? 100 : 35, hit };
}

function factor(site: GoalFitSite, key: string): number {
  return site.factors[key] ?? site.overallScore;
}

function objectiveKey(goal: CampaignGoal): string {
  const blob = `${goal.objective ?? ""} ${(goal.kpis ?? []).join(" ")}`.toLowerCase();
  if (blob.includes("launch") || blob.includes("trial")) return "launch";
  if (blob.includes("footfall") || blob.includes("retail")) return "footfall";
  if (blob.includes("corridor") || blob.includes("takeover") || blob.includes("dominance")) {
    return "corridor";
  }
  if (blob.includes("recall") || blob.includes("awareness") || blob.includes("visibility")) {
    return "awareness";
  }
  return "awareness";
}

function relevantScore(site: GoalFitSite, kind: string): { value: number; reason: string } {
  if (kind === "footfall") {
    const value = factor(site, "audience_fit") * 0.55 + factor(site, "commercial_fit") * 0.45;
    return { value, reason: "Better reach" };
  }
  if (kind === "launch") {
    const value = factor(site, "approach_exposure") * 0.5 + factor(site, "audience_fit") * 0.5;
    return { value, reason: "Stronger launch visibility" };
  }
  if (kind === "corridor") {
    const value = factor(site, "visibility") * 0.6 + factor(site, "approach_exposure") * 0.4;
    return { value, reason: "Corridor impact" };
  }
  const value = factor(site, "visibility") * 0.5 + factor(site, "brand_suitability") * 0.5;
  return { value, reason: "Stronger recall" };
}

export function scoreGoalFit(site: GoalFitSite, goal: CampaignGoal): { score: number; reason: string } {
  const kind = objectiveKey(goal);
  const relevant = relevantScore(site, kind);
  const specific = geoSpecific(site, goal);
  const measurable = site.overallScore;
  const share = goal.budget && goal.maxLocations ? goal.budget / Math.max(1, goal.maxLocations) : 0;
  let achievable = 70;
  if (share > 0 && site.rateAmount > 0) {
    const ratio = site.rateAmount / share;
    if (ratio <= 1.15) achievable = 95;
    else if (ratio <= 1.4) achievable = 70;
    else achievable = 40;
  }

  const score = clamp(
    relevant.value * 0.4 + specific.score * 0.25 + measurable * 0.2 + achievable * 0.15
  );

  let reason = relevant.reason;
  if (specific.hit) {
    reason =
      corridorMatch(site, goal.geographicFocus ?? []) &&
      !listHas(goal.cities, site.city) &&
      !listHas(goal.states, site.state)
        ? "On your target corridor"
        : "On your target market";
  } else if (achievable >= 90 && site.rateAmount > 0) {
    reason = "Fits this budget";
  }
  return { score, reason };
}

export function pickGoalAlternatives(
  current: GoalFitSite,
  pool: GoalFitSite[],
  goal: CampaignGoal,
  count = 5
): GoalAlternative[] {
  const currentFit = scoreGoalFit(current, goal);
  const scored = pool
    .filter((site) => site.locationId !== current.locationId && site.inventoryId !== current.inventoryId)
    .map((site) => {
      const fit = scoreGoalFit(site, goal);
      return { site, fit };
    })
    .sort((a, b) => b.fit.score - a.fit.score);

  const threshold = currentFit.score * 0.92;
  const better = scored.filter((row) => row.fit.score >= threshold);
  const ranked = (better.length > 0 ? better : scored).slice(0, count);

  return ranked.map(({ site, fit }) => ({
    inventoryId: site.inventoryId,
    locationId: site.locationId,
    locationName: site.locationName,
    skyarcSiteCode: site.skyarcSiteCode ?? null,
    road: site.road,
    score: site.overallScore,
    goalFit: fit.score,
    fitReason: fit.reason,
    rateAmount: site.rateAmount,
    inventoryType: site.inventoryType ?? null,
    lighting: site.lighting ?? null,
  }));
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

export function parseCampaignGoal(briefJson: unknown, budget?: number, maxLocations?: number): CampaignGoal {
  const brief =
    briefJson && typeof briefJson === "object" ? (briefJson as Record<string, unknown>) : {};
  const fromObjectives = stringList(brief.objectives)?.join(" ");
  return {
    objective:
      typeof brief.objective === "string" && brief.objective.trim()
        ? brief.objective
        : fromObjectives,
    geographicFocus: stringList(brief.geographicFocus),
    cities: stringList(brief.cities),
    states: stringList(brief.states),
    kpis: stringList(brief.kpis),
    budget: typeof brief.budget === "number" ? brief.budget : budget,
    maxLocations:
      typeof brief.maxLocations === "number" && brief.maxLocations > 0
        ? brief.maxLocations
        : maxLocations,
  };
}

export function assignGoalAlternatives(
  selected: GoalFitSite[],
  leftovers: GoalFitSite[],
  goal: CampaignGoal,
  count = 5
): Map<string, GoalAlternative[]> {
  const assigned = new Map<string, GoalAlternative[]>();
  for (const current of selected) {
    assigned.set(current.inventoryId, pickGoalAlternatives(current, leftovers, goal, count));
  }
  return assigned;
}
