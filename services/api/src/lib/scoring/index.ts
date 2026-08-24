import {
  ScoringFactor,
  ScoreStatus,
  type ScoringFactor as ScoringFactorType,
} from "@skyarc/shared";

export interface ScoreComponent {
  factor: ScoringFactorType;
  score: number;
  confidence: number;
  status: ScoreStatus;
  evidence: string[];
}

export interface ComputeScoreInput {
  weights: Record<ScoringFactorType, number>;
  attributes: Record<string, { value: unknown; confidence?: number | null }>;
}

export interface ComputeScoreResult {
  overallScore: number;
  overallConfidence: number;
  status: ScoreStatus;
  components: ScoreComponent[];
}

const FACTOR_ATTRIBUTE_MAP: Record<ScoringFactorType, string> = {
  [ScoringFactor.VISIBILITY]: "visibility",
  [ScoringFactor.AUDIENCE_FIT]: "audience_fit",
  [ScoringFactor.COMMERCIAL_FIT]: "commercial_fit",
  [ScoringFactor.APPROACH_EXPOSURE]: "approach_exposure",
  [ScoringFactor.BRAND_SUITABILITY]: "brand_suitability",
  [ScoringFactor.VISUAL_COMPETITION]: "visual_competition",
  [ScoringFactor.LOCATION_QUALITY]: "location_quality",
  [ScoringFactor.DATA_CONFIDENCE]: "data_confidence",
};

function toScore(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return Math.max(0, Math.min(100, value));
  }
  return null;
}

export function computeLocationScore(input: ComputeScoreInput): ComputeScoreResult {
  const components: ScoreComponent[] = [];
  let weightedSum = 0;
  let totalWeight = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let hasIncomplete = false;

  for (const factor of Object.values(ScoringFactor)) {
    const weight = input.weights[factor] ?? 0;
    const attrKey = FACTOR_ATTRIBUTE_MAP[factor];
    const attr = input.attributes[attrKey];
    const rawScore = attr ? toScore(attr.value) : null;
    const confidence = attr?.confidence ?? (rawScore !== null ? 0.5 : 0);

    if (rawScore === null) {
      hasIncomplete = true;
      components.push({
        factor,
        score: 0,
        confidence: 0,
        status: ScoreStatus.INCOMPLETE,
        evidence: [`Missing attribute: ${attrKey}`],
      });
      continue;
    }

    weightedSum += rawScore * weight;
    totalWeight += weight;
    confidenceSum += confidence;
    confidenceCount += 1;

    components.push({
      factor,
      score: rawScore,
      confidence,
      status: ScoreStatus.COMPUTED,
      evidence: [],
    });
  }

  const overallScore =
    totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
  const overallConfidence =
    confidenceCount > 0
      ? Math.round((confidenceSum / confidenceCount) * 100) / 100
      : 0;

  return {
    overallScore,
    overallConfidence,
    status: hasIncomplete ? ScoreStatus.INCOMPLETE : ScoreStatus.COMPUTED,
    components,
  };
}
