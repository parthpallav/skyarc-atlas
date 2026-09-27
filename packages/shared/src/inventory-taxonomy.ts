/**
 * Inventory taxonomy: Digital / Static / Conceptual with subtypes,
 * plus production specs shaped after Skyarc digital LED sheets.
 */

export const InventoryClass = {
  DIGITAL: "DIGITAL",
  STATIC: "STATIC",
  CONCEPTUAL: "CONCEPTUAL",
} as const;
export type InventoryClass = (typeof InventoryClass)[keyof typeof InventoryClass];

export const DigitalSubtype = {
  LED: "LED",
  KIOSK: "KIOSK",
} as const;
export type DigitalSubtype = (typeof DigitalSubtype)[keyof typeof DigitalSubtype];

export const StaticLighting = {
  BACKLIT: "BACKLIT",
  FRONTLIT: "FRONTLIT",
  NON_LIT: "NON_LIT",
} as const;
export type StaticLighting = (typeof StaticLighting)[keyof typeof StaticLighting];

export const INVENTORY_CLASS_LABELS: Record<InventoryClass, string> = {
  DIGITAL: "Digital",
  STATIC: "Static",
  CONCEPTUAL: "Conceptual",
};

export const DIGITAL_SUBTYPE_LABELS: Record<DigitalSubtype, string> = {
  LED: "LED / Billboard screen",
  KIOSK: "Kiosk / Interactive totem",
};

export const STATIC_LIGHTING_LABELS: Record<StaticLighting, string> = {
  BACKLIT: "Backlit",
  FRONTLIT: "Frontlit",
  NON_LIT: "Non-lit",
};

/** Maps wizard class+subtype → stored Inventory.inventoryType string. */
export function inventoryTypeFromTaxonomy(
  inventoryClass: InventoryClass,
  subtype?: string | null
): string {
  if (inventoryClass === InventoryClass.DIGITAL) {
    if (subtype === DigitalSubtype.KIOSK) return "KIOSK";
    return "DIGITAL_BILLBOARD";
  }
  if (inventoryClass === InventoryClass.STATIC) return "STATIC_BILLBOARD";
  return "OTHER";
}

export function inventoryClassFromType(type?: string | null): InventoryClass {
  const value = (type ?? "").toUpperCase();
  if (value.includes("KIOSK") || value === "STANDEE" || value.includes("DIGITAL")) {
    return InventoryClass.DIGITAL;
  }
  if (
    value.includes("STATIC") ||
    value === "UNIPOLE" ||
    value === "GANTRY" ||
    value.includes("HOARDING") ||
    value.includes("BUS_SHELTER")
  ) {
    return InventoryClass.STATIC;
  }
  if (value === "OTHER" || value === "CONCEPTUAL") return InventoryClass.CONCEPTUAL;
  return InventoryClass.CONCEPTUAL;
}

export function digitalSubtypeFromType(type?: string | null): DigitalSubtype | null {
  const value = (type ?? "").toUpperCase();
  if (value.includes("KIOSK") || value === "STANDEE") return DigitalSubtype.KIOSK;
  if (value.includes("DIGITAL") || value.includes("LED")) return DigitalSubtype.LED;
  return null;
}

export type DigitalProductionSpecs = {
  resolutionW: number;
  resolutionH: number;
  physicalWidthM?: number | null;
  physicalHeightM?: number | null;
  displayAreaSqFt?: number | null;
  staticFormats: string[];
  motionFormats: string[];
  colorMode: "RGB" | "CMYK" | string;
  dpi: number;
  maxFileSizeMb: number;
  frameRates: number[];
  maxBitrateMbps: number;
  codec?: string | null;
  loopDurationSec?: number | null;
  slotDurationSec?: number | null;
  submissionLeadDays?: number | null;
  namingFormatHint?: string | null;
  notes?: string | null;
};

export type StaticProductionSpecs = {
  widthFt?: number | null;
  heightFt?: number | null;
  lighting: StaticLighting | string;
  materialNotes?: string | null;
};

export type ConceptualProductionSpecs = {
  widthFt?: number | null;
  heightFt?: number | null;
  conceptNotes?: string | null;
  mockupRequired?: boolean;
};

/** Canonical shape stored under Inventory.staticSpecsJson. */
export type InventorySpecsJson = {
  class: InventoryClass;
  subtype?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
  lighting?: string | null;
  sqft?: number | null;
  production?: DigitalProductionSpecs | StaticProductionSpecs | ConceptualProductionSpecs | null;
};

/** Classic Hub LED (Rajkot) sheet defaults — reusable for digital LED faces. */
export const DEFAULT_DIGITAL_LED_PRODUCTION: DigitalProductionSpecs = {
  resolutionW: 1920,
  resolutionH: 1080,
  physicalWidthM: 9,
  physicalHeightM: 4.5,
  displayAreaSqFt: 500,
  staticFormats: ["jpg", "png"],
  motionFormats: ["mp4", "mov"],
  colorMode: "RGB",
  dpi: 72,
  maxFileSizeMb: 10,
  frameRates: [30, 60],
  maxBitrateMbps: 10,
  codec: "H.264",
  loopDurationSec: null,
  slotDurationSec: null,
  submissionLeadDays: 3,
  namingFormatHint: "Brand_Skyarc_TOP_DDMMYYYY.mp4",
  notes: null,
};

export const DEFAULT_DIGITAL_KIOSK_PRODUCTION: DigitalProductionSpecs = {
  ...DEFAULT_DIGITAL_LED_PRODUCTION,
  resolutionW: 1080,
  resolutionH: 1920,
  physicalWidthM: null,
  physicalHeightM: null,
  displayAreaSqFt: null,
  namingFormatHint: "Brand_Skyarc_KIOSK_DDMMYYYY.mp4",
};

export function defaultProductionFor(
  inventoryClass: InventoryClass,
  subtype?: string | null
): DigitalProductionSpecs | StaticProductionSpecs | ConceptualProductionSpecs {
  if (inventoryClass === InventoryClass.DIGITAL) {
    return subtype === DigitalSubtype.KIOSK
      ? { ...DEFAULT_DIGITAL_KIOSK_PRODUCTION }
      : { ...DEFAULT_DIGITAL_LED_PRODUCTION };
  }
  if (inventoryClass === InventoryClass.STATIC) {
    return {
      widthFt: null,
      heightFt: null,
      lighting: StaticLighting.FRONTLIT,
      materialNotes: null,
    };
  }
  return {
    widthFt: null,
    heightFt: null,
    conceptNotes: null,
    mockupRequired: true,
  };
}

export function parseInventorySpecsJson(raw: unknown): InventorySpecsJson | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const cls =
    o.class === InventoryClass.DIGITAL ||
    o.class === InventoryClass.STATIC ||
    o.class === InventoryClass.CONCEPTUAL
      ? o.class
      : null;
  if (!cls) {
    // Legacy shape: width/height only
    if (o.widthFt != null || o.heightFt != null || o.lighting != null) {
      return {
        class: InventoryClass.STATIC,
        widthFt: typeof o.widthFt === "number" ? o.widthFt : null,
        heightFt: typeof o.heightFt === "number" ? o.heightFt : null,
        lighting: typeof o.lighting === "string" ? o.lighting : typeof o.lightingType === "string" ? o.lightingType : null,
        sqft: typeof o.sqft === "number" ? o.sqft : null,
        production: null,
      };
    }
    return null;
  }
  return {
    class: cls,
    subtype: typeof o.subtype === "string" ? o.subtype : null,
    widthFt: typeof o.widthFt === "number" ? o.widthFt : null,
    heightFt: typeof o.heightFt === "number" ? o.heightFt : null,
    lighting: typeof o.lighting === "string" ? o.lighting : null,
    sqft: typeof o.sqft === "number" ? o.sqft : null,
    production:
      o.production && typeof o.production === "object"
        ? (o.production as InventorySpecsJson["production"])
        : null,
  };
}

export function buildInventorySpecsJson(input: {
  inventoryClass: InventoryClass;
  subtype?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
  lighting?: string | null;
  production?: InventorySpecsJson["production"];
}): InventorySpecsJson {
  const widthFt = input.widthFt ?? null;
  const heightFt = input.heightFt ?? null;
  const sqft =
    widthFt != null && heightFt != null ? Math.round(widthFt * heightFt * 10) / 10 : null;
  return {
    class: input.inventoryClass,
    subtype: input.subtype ?? null,
    widthFt,
    heightFt,
    lighting: input.lighting ?? null,
    sqft,
    production: input.production ?? null,
  };
}
