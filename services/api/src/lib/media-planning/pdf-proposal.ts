import { formatInventoryType, isDigitalInventoryType } from "@skyarc/shared";

/** PDF-only labels mapped from Atlas Index factor attr keys. */
export const PDF_FACTOR_BAR_MAP = [
  { label: "Visibility", attrKey: "visibility" },
  { label: "Reach", attrKey: "audience_fit" },
  { label: "Awareness", attrKey: "approach_exposure" },
  { label: "Recall", attrKey: "brand_suitability" },
  { label: "Traffic", attrKey: "location_quality" },
] as const;

export type ProposalBadge = {
  label: string;
  premium: boolean;
};

export function proposalBadgeForIndex(overall: number | null | undefined): ProposalBadge | null {
  if (overall == null || !Number.isFinite(overall)) return null;
  const score = Math.round(overall);
  if (score >= 85) return { label: "Must Buy", premium: true };
  if (score >= 75) return { label: "Strong Buy", premium: false };
  if (score >= 55) return { label: "Recommended", premium: false };
  return { label: "Consider", premium: false };
}

export function mapFactorBarsForPdf(
  factorScores: Record<string, number> | null | undefined
): Array<{ label: string; score: number }> {
  const scores = factorScores ?? {};
  return PDF_FACTOR_BAR_MAP.map(({ label, attrKey }) => ({
    label,
    score: Math.max(0, Math.min(100, Math.round(Number(scores[attrKey]) || 0))),
  }));
}

export function averageIndex(scores: Array<number | null | undefined>): number | null {
  const vals = scores.filter((s): s is number => s != null && Number.isFinite(s));
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Artwork guidance defaults by inventory type (customer PDF). */
export function artworkGuidanceForType(
  inventoryType?: string | null,
  opts?: { widthFt?: number | null; heightFt?: number | null; dualScreen?: boolean }
): string {
  const type = (inventoryType ?? "").toUpperCase();
  const digital = isDigitalInventoryType(inventoryType);
  const dual = opts?.dualScreen === true || type.includes("DUAL");

  if (digital) {
    if (dual) {
      return (
        "1920 px width X 1080 px Height for upper | 1920 px width X 1080 px Height for Lower | Color Mode : RGB only | " +
        "DPI : 72 | File Size : 50 MB | Format : MP4 or Mov [H.264 Codec] | Frame Rate : 30 Fps, 60 Fps | Bitrate : 10 Mbps (VBR)"
      );
    }
    return (
      "1920 px width X 1080 px Height | Color Mode : RGB only | DPI : 72 | File Size : 50 MB | " +
      "Format : MP4 or Mov [H.264 Codec] | Frame Rate : 30 Fps, 60 Fps | Bitrate : 10 Mbps (VBR)"
    );
  }

  if (type.includes("KIOSK") || type.includes("TOTEM") || type.includes("STANDEE")) {
    return (
      "1080 px width X 1920 px Height (portrait) | Color Mode : RGB | DPI : 72 | " +
      "Format : MP4 or PNG sequence | Loop 10–15 seconds | Safe margin 5%"
    );
  }

  if (type.includes("BQS") || type.includes("SHELTER") || type.includes("BUS")) {
    return (
      "Print-ready CMYK at 150 DPI | Size matched to shelter face | 50 mm bleed | " +
      "Weather-resistant vinyl | Brand lockup inside safe area"
    );
  }

  const size =
    opts?.widthFt && opts?.heightFt
      ? `${opts.widthFt} Ft X ${opts.heightFt} Ft`
      : "confirmed face size";
  return (
    `Print-ready CMYK at 150 DPI for ${size} ${formatInventoryType(inventoryType)} | ` +
    "50 mm bleed | High-contrast lockup | Brand marks inside safe area"
  );
}

export function formatProposalTimestamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}_${get("month")}_${get("year")} | ${get("hour")}:${get("minute")}`;
}

export function formatProposalDateLong(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Customer PDF rates: Actual = list, Discounted = plan.
 * Strike Actual only when list is strictly greater than plan.
 */
export function resolveProposalRates(input: {
  listRate?: number | null;
  planRate?: number | null;
  fallback?: number | null;
}): { listRate: number | null; planRate: number; showStrike: boolean } {
  const fallback = input.fallback != null && input.fallback > 0 ? Math.round(input.fallback) : 0;
  const list =
    input.listRate != null && input.listRate > 0 ? Math.round(input.listRate) : null;
  const plan =
    input.planRate != null && input.planRate > 0
      ? Math.round(input.planRate)
      : list ?? fallback;
  const showStrike = list != null && list > plan;
  return { listRate: list, planRate: plan, showStrike };
}
