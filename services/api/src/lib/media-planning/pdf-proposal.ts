import {
  formatInventoryType,
  isDigitalInventoryType,
  parseInventorySpecsJson,
  type DigitalProductionSpecs,
  type InventorySpecsJson,
  type StaticProductionSpecs,
} from "@skyarc/shared";

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
};

/** Index band label only — PREMIUM stamp is driven by location.premium, not Index. */
export function proposalBadgeForIndex(overall: number | null | undefined): ProposalBadge | null {
  if (overall == null || !Number.isFinite(overall)) return null;
  const score = Math.round(overall);
  if (score >= 85) return { label: "Must Buy" };
  if (score >= 75) return { label: "Strong Buy" };
  if (score >= 55) return { label: "Recommended" };
  return { label: "Consider" };
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

function isDigitalProduction(p: unknown): p is DigitalProductionSpecs {
  return (
    !!p &&
    typeof p === "object" &&
    "resolutionW" in p &&
    typeof (p as DigitalProductionSpecs).resolutionW === "number"
  );
}

function isStaticProduction(p: unknown): p is StaticProductionSpecs {
  return !!p && typeof p === "object" && "lighting" in p && !("resolutionW" in p);
}

function formatDigitalProduction(
  prod: DigitalProductionSpecs,
  opts?: { dualScreen?: boolean }
): string {
  const dual = opts?.dualScreen === true;
  const res = `${prod.resolutionW} px width X ${prod.resolutionH} px Height`;
  const sizeBit = dual ? `${res} for upper | ${res} for Lower` : res;
  const color = prod.colorMode ? `Color Mode : ${prod.colorMode}` : "Color Mode : RGB";
  const dpi = prod.dpi != null ? `DPI : ${prod.dpi}` : null;
  const fileSize = prod.maxFileSizeMb != null ? `File Size : ${prod.maxFileSizeMb} MB` : null;
  const formats = [
    ...(prod.motionFormats ?? []),
    ...(prod.staticFormats ?? []),
  ].filter(Boolean);
  const formatBit = formats.length
    ? `Format : ${formats.map((f) => f.toUpperCase()).join(" or ")}${prod.codec ? ` [${prod.codec} Codec]` : ""}`
    : null;
  const fps =
    prod.frameRates?.length ? `Frame Rate : ${prod.frameRates.map((f) => `${f} Fps`).join(", ")}` : null;
  const bitrate =
    prod.maxBitrateMbps != null ? `Bitrate : ${prod.maxBitrateMbps} Mbps (VBR)` : null;
  return [sizeBit, color, dpi, fileSize, formatBit, fps, bitrate].filter(Boolean).join(" | ");
}

function formatStaticProduction(
  prod: StaticProductionSpecs,
  inventoryType?: string | null,
  fallbackSize?: { widthFt?: number | null; heightFt?: number | null }
): string {
  const w = prod.widthFt ?? fallbackSize?.widthFt;
  const h = prod.heightFt ?? fallbackSize?.heightFt;
  const size = w && h ? `${w} Ft X ${h} Ft` : "confirmed face size";
  const material = prod.materialNotes?.trim();
  if (material) {
    return `${material} | Size ${size} ${formatInventoryType(inventoryType)}`;
  }
  return (
    `Print-ready CMYK at 150 DPI for ${size} ${formatInventoryType(inventoryType)} | ` +
    "50 mm bleed | High-contrast lockup | Brand marks inside safe area"
  );
}

/** Prefer stored form specs; fall back to static vs digital defaults only. */
export function artworkGuidanceFromSpecs(
  staticSpecsJson: unknown,
  inventoryType?: string | null,
  opts?: { dualScreen?: boolean; widthFt?: number | null; heightFt?: number | null }
): string {
  const parsed: InventorySpecsJson | null = parseInventorySpecsJson(staticSpecsJson);
  const widthFt = opts?.widthFt ?? parsed?.widthFt ?? null;
  const heightFt = opts?.heightFt ?? parsed?.heightFt ?? null;
  const production = parsed?.production ?? null;

  if (isDigitalProduction(production)) {
    return formatDigitalProduction(production, { dualScreen: opts?.dualScreen });
  }
  if (isStaticProduction(production)) {
    return formatStaticProduction(production, inventoryType, { widthFt, heightFt });
  }

  return artworkGuidanceForType(inventoryType, {
    dualScreen: opts?.dualScreen,
    widthFt,
    heightFt,
  });
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
