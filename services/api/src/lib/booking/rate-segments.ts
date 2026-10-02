/**
 * Select rate cards that overlap a campaign flight.
 * When rates change mid-flight, returns segments for pro-rated pricing.
 */

export type RateSegment = {
  amount: number;
  period: string;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  /** Inclusive overlap within the flight */
  segmentStart: Date;
  segmentEnd: Date;
  rateCardId?: string;
};

type RateCardLike = {
  id?: string;
  amount: unknown;
  period: string;
  currency?: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

function dayStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function inclusiveDays(start: Date, end: Date): number {
  const a = dayStartUtc(start).getTime();
  const b = dayStartUtc(end).getTime();
  if (b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

export function selectRateSegmentsForFlight(
  cards: RateCardLike[],
  flightStart: Date,
  flightEnd: Date
): RateSegment[] {
  const start = dayStartUtc(flightStart);
  const end = dayStartUtc(flightEnd);
  const sorted = [...cards].sort(
    (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime()
  );

  const segments: RateSegment[] = [];
  for (const card of sorted) {
    const cardFrom = dayStartUtc(card.effectiveFrom);
    const cardTo = card.effectiveTo ? dayStartUtc(card.effectiveTo) : null;
    const segStart = cardFrom > start ? cardFrom : start;
    const segEnd = cardTo && cardTo < end ? cardTo : end;
    if (segEnd < segStart) continue;
    // Card must be active on segStart
    if (cardFrom > segEnd) continue;
    if (cardTo && cardTo < segStart) continue;
    segments.push({
      amount: Number(card.amount),
      period: card.period,
      currency: card.currency ?? "INR",
      effectiveFrom: card.effectiveFrom,
      effectiveTo: card.effectiveTo,
      segmentStart: segStart,
      segmentEnd: segEnd,
      rateCardId: card.id,
    });
  }

  // Deduplicate overlapping by preferring later effectiveFrom
  segments.sort((a, b) => a.segmentStart.getTime() - b.segmentStart.getTime());
  return segments;
}

export function weightedMediaCostFromSegments(
  segments: RateSegment[],
  flightCost: (input: {
    rateAmount: number;
    ratePeriod: string;
    startDate: Date;
    endDate: Date;
  }) => number
): { mediaCost: number; daysCovered: number; segments: RateSegment[] } {
  let mediaCost = 0;
  let daysCovered = 0;
  for (const seg of segments) {
    const days = inclusiveDays(seg.segmentStart, seg.segmentEnd);
    if (days <= 0 || !(seg.amount > 0)) continue;
    mediaCost += flightCost({
      rateAmount: seg.amount,
      ratePeriod: seg.period,
      startDate: seg.segmentStart,
      endDate: seg.segmentEnd,
    });
    daysCovered += days;
  }
  return { mediaCost, daysCovered, segments };
}
