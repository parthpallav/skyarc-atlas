import { parseSkyarcLocationCommercial } from "./commercial.js";

const INVENTORY_TYPE_LABELS: Record<string, string> = {
  DIGITAL_BILLBOARD: "Digital Billboard / LED",
  STATIC_BILLBOARD: "Static Billboard / Hoarding",
  UNIPOLE: "Unipole",
  GANTRY: "Gantry / Overbridge",
  BUS_SHELTER: "Bus Queue Shelter (BQS)",
  KIOSK: "Kiosk / Interactive Totem",
};

function formatInventoryType(type?: string | null): string {
  if (!type) return "Digital";
  if (INVENTORY_TYPE_LABELS[type]) return INVENTORY_TYPE_LABELS[type];
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Minimum share of allocated plan budget that should sit on Skyarc-catalog sites (SKY- site code). */
export const DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT = 60;

const PREMIUM_LABEL_ALIASES: Record<string, readonly string[]> = {
  "Digital Billboard (DOOH)": ["Digital Billboard / LED", "Digital Billboard (DOOH)"],
  Unipole: ["Unipole"],
  "Gantry / Overbridge": ["Gantry / Overbridge"],
};

export function isSkyarcCatalogSite(skyarcSiteCode?: string | null): boolean {
  const code = skyarcSiteCode?.trim();
  return Boolean(code);
}

export function inventoryLabelMatchesPremiumFormat(
  premiumFormats: readonly string[],
  inventoryType?: string | null
): boolean {
  const label = formatInventoryType(inventoryType);
  for (const format of premiumFormats) {
    if (format === label) return true;
    const aliases = PREMIUM_LABEL_ALIASES[format];
    if (aliases?.includes(label)) return true;
  }
  return false;
}

export function isPremiumPlanningSite(input: {
  inventoryType?: string | null;
  skyarcCommercialJson?: unknown;
  premiumFormats: readonly string[];
}): boolean {
  const commercial = parseSkyarcLocationCommercial(input.skyarcCommercialJson);
  if (commercial.premium) return true;
  return inventoryLabelMatchesPremiumFormat(input.premiumFormats, input.inventoryType);
}

export function budgetMixPercent(
  items: Array<{ budgetAllocated: number; included: boolean }>
): number {
  const allocated = items.reduce((sum, row) => sum + row.budgetAllocated, 0);
  if (allocated <= 0) return 0;
  const slice = items
    .filter((row) => row.included)
    .reduce((sum, row) => sum + row.budgetAllocated, 0);
  return Math.round((slice / allocated) * 100);
}
