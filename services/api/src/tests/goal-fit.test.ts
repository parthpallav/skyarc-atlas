import { describe, expect, it } from "vitest";
import { assignGoalAlternatives, pickGoalAlternatives, scoreGoalFit, type GoalFitSite } from "../lib/media-planning/goal-fit.js";

function site(partial: Partial<GoalFitSite> & Pick<GoalFitSite, "inventoryId" | "locationId">): GoalFitSite {
  return {
    locationName: "Site",
    road: "Other Road",
    overallScore: 50,
    rateAmount: 40_000,
    factors: {
      visibility: 50,
      brand_suitability: 50,
      audience_fit: 50,
      approach_exposure: 50,
      commercial_fit: 50,
    },
    ...partial,
  };
}

describe("goal-fit alternatives", () => {
  it("prefers a site on the campaign corridor over a random leftover", () => {
    const current = site({
      inventoryId: "a",
      locationId: "l1",
      road: "Tagore Road",
      overallScore: 80,
      factors: { visibility: 80, brand_suitability: 78, audience_fit: 60, approach_exposure: 70, commercial_fit: 60 },
    });
    const onCorridor = site({
      inventoryId: "b",
      locationId: "l2",
      locationName: "Kalawad face",
      road: "Kalawad Road",
      overallScore: 72,
      factors: { visibility: 74, brand_suitability: 76, audience_fit: 62, approach_exposure: 70, commercial_fit: 58 },
    });
    const offCorridor = site({
      inventoryId: "c",
      locationId: "l3",
      road: "Service Lane",
      overallScore: 88,
      factors: { visibility: 88, brand_suitability: 84, audience_fit: 80, approach_exposure: 80, commercial_fit: 80 },
    });

    const picked = pickGoalAlternatives(current, [offCorridor, onCorridor], {
      objective: "Brand Awareness & Recall",
      geographicFocus: ["Kalawad Road"],
      budget: 500000,
      maxLocations: 10,
    });

    expect(picked[0]?.inventoryId).toBe("b");
    expect(picked[0]?.fitReason).toBe("On your target corridor");
  });

  it("boosts sites in the campaign target city", () => {
    const inCity = site({
      inventoryId: "in",
      locationId: "l1",
      city: "Ahmedabad",
      district: "Ahmedabad",
      state: "Gujarat",
      overallScore: 60,
    });
    const outCity = site({
      inventoryId: "out",
      locationId: "l2",
      city: "Surat",
      district: "Surat",
      state: "Gujarat",
      overallScore: 90,
    });
    const inFit = scoreGoalFit(inCity, {
      objective: "Brand Awareness & Recall",
      cities: ["Ahmedabad"],
      budget: 500000,
      maxLocations: 10,
    });
    const outFit = scoreGoalFit(outCity, {
      objective: "Brand Awareness & Recall",
      cities: ["Ahmedabad"],
      budget: 500000,
      maxLocations: 10,
    });
    expect(inFit.score).toBeGreaterThan(outFit.score);
    expect(inFit.reason).toBe("On your target market");
  });

  it("gives each selected site several swap options from the leftover pool", () => {
    const selected = [
      site({ inventoryId: "a", locationId: "l1", overallScore: 80 }),
      site({ inventoryId: "b", locationId: "l2", overallScore: 78 }),
    ];
    const leftovers = [
      site({
        inventoryId: "best",
        locationId: "l9",
        road: "Kalawad Road",
        overallScore: 88,
        factors: { visibility: 90, brand_suitability: 88, audience_fit: 70, approach_exposure: 80, commercial_fit: 70 },
      }),
      site({ inventoryId: "mid", locationId: "l8", overallScore: 60 }),
      site({ inventoryId: "low", locationId: "l7", overallScore: 50 }),
    ];
    const assigned = assignGoalAlternatives(selected, leftovers, {
      objective: "Brand Awareness & Recall",
      geographicFocus: ["Kalawad Road"],
      budget: 500000,
      maxLocations: 2,
    });
    expect(assigned.get("a")?.length).toBeGreaterThanOrEqual(2);
    expect(assigned.get("b")?.length).toBeGreaterThanOrEqual(2);
  });

  it("scores footfall goals on audience, not just overall score", () => {
    const reach = site({
      inventoryId: "r",
      locationId: "l9",
      overallScore: 55,
      factors: { visibility: 50, brand_suitability: 50, audience_fit: 92, approach_exposure: 60, commercial_fit: 88 },
    });
    const pretty = site({
      inventoryId: "p",
      locationId: "l8",
      overallScore: 90,
      factors: { visibility: 95, brand_suitability: 90, audience_fit: 40, approach_exposure: 50, commercial_fit: 40 },
    });
    const reachFit = scoreGoalFit(reach, { objective: "Footfall & Retail Drive" });
    const prettyFit = scoreGoalFit(pretty, { objective: "Footfall & Retail Drive" });
    expect(reachFit.score).toBeGreaterThan(prettyFit.score);
    expect(reachFit.reason).toBe("Better reach");
  });

  it("can recommend a higher-priced site because budget is reallocated across the mix", () => {
    const current = site({
      inventoryId: "a",
      locationId: "l1",
      rateAmount: 40_000,
      overallScore: 80,
    });
    const dearer = site({
      inventoryId: "x",
      locationId: "l9",
      rateAmount: 90_000,
      overallScore: 95,
      factors: { visibility: 95, brand_suitability: 90, audience_fit: 80, approach_exposure: 80, commercial_fit: 80 },
    });
    const cheaper = site({
      inventoryId: "y",
      locationId: "l8",
      rateAmount: 35_000,
      overallScore: 70,
    });
    const picked = pickGoalAlternatives(current, [dearer, cheaper], { budget: 80_000, maxLocations: 2 }, 2);
    expect(picked[0]?.inventoryId).toBe("x");
  });
});
