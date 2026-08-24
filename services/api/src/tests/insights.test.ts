import { describe, expect, it } from "vitest";
import {
  buildPlanSummary,
  buildSiteInsights,
  estimateFactorScores,
} from "../lib/media-planning/insights.js";

describe("media plan insights", () => {
  it("estimates factor scores from site attributes", () => {
    const scores = estimateFactorScores({
      sqft: 400,
      lightingType: "backlit",
      road: "150 Feet Ring Road",
    });
    expect(scores.visibility).toBeGreaterThanOrEqual(70);
    expect(scores.approach_exposure).toBeGreaterThanOrEqual(60);
    expect(scores.brand_suitability).toBeGreaterThan(0);
  });

  it("builds client-facing site insights", () => {
    const factors = estimateFactorScores({
      sqft: 350,
      lightingType: "frontlit",
      road: "Kalawad Road",
    });
    const insights = buildSiteInsights({
      rank: 1,
      locationName: "G-1507 — Amin Marg",
      road: "Amin Marg",
      budgetAllocated: 120000,
      overallScore: 82,
      attributes: { sqft: 350, lighting_type: "frontlit", ...factors },
      componentsJson: null,
    });

    expect(insights.metrics.length).toBe(4);
    expect(insights.explanationText).toContain("Rank #1");
    expect(insights.highlights.length).toBeGreaterThan(0);
  });

  it("summarizes plan-level awareness and recall averages", () => {
    const factors = estimateFactorScores({ sqft: 400, lightingType: "backlit", road: "Ring Road" });
    const site = buildSiteInsights({
      rank: 1,
      locationName: "Site A",
      road: "Ring Road",
      budgetAllocated: 100000,
      overallScore: 80,
      attributes: factors,
    });
    const summary = buildPlanSummary([site, site]);
    expect(summary.siteCount).toBe(2);
    expect(summary.avgVisibility).toBeGreaterThan(0);
    expect(summary.strengths.length).toBeGreaterThan(0);
  });
});
