import { describe, expect, it } from "vitest";
import { ScoringFactor, ScoreStatus } from "@skyarc/shared";
import { computeLocationScore } from "../lib/scoring/index.js";

describe("computeLocationScore", () => {
  const weights = {
    [ScoringFactor.VISIBILITY]: 25,
    [ScoringFactor.AUDIENCE_FIT]: 20,
    [ScoringFactor.COMMERCIAL_FIT]: 15,
    [ScoringFactor.APPROACH_EXPOSURE]: 15,
    [ScoringFactor.BRAND_SUITABILITY]: 10,
    [ScoringFactor.VISUAL_COMPETITION]: 5,
    [ScoringFactor.LOCATION_QUALITY]: 5,
    [ScoringFactor.DATA_CONFIDENCE]: 5,
  };

  it("returns INCOMPLETE when attributes are missing", () => {
    const result = computeLocationScore({ weights, attributes: {} });
    expect(result.status).toBe(ScoreStatus.INCOMPLETE);
    expect(result.overallScore).toBe(0);
  });

  it("computes weighted score from available attributes", () => {
    const result = computeLocationScore({
      weights,
      attributes: {
        visibility: { value: 80, confidence: 0.9 },
        audience_fit: { value: 60, confidence: 0.8 },
      },
    });
    expect(result.status).toBe(ScoreStatus.INCOMPLETE);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.components.length).toBe(8);
  });

  it("returns COMPUTED when all factors present", () => {
    const attributes: Record<string, { value: number; confidence: number }> = {};
    attributes.visibility = { value: 80, confidence: 0.9 };
    attributes.audience_fit = { value: 70, confidence: 0.8 };
    attributes.commercial_fit = { value: 60, confidence: 0.7 };
    attributes.approach_exposure = { value: 75, confidence: 0.8 };
    attributes.brand_suitability = { value: 65, confidence: 0.7 };
    attributes.visual_competition = { value: 50, confidence: 0.6 };
    attributes.location_quality = { value: 70, confidence: 0.8 };
    attributes.data_confidence = { value: 80, confidence: 0.9 };

    const result = computeLocationScore({ weights, attributes });
    expect(result.status).toBe(ScoreStatus.COMPUTED);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});
