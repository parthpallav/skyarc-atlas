import { parseInventorySpecsJson } from "./inventory-taxonomy.js";
import { effectiveSlotCapacity, isDigitalInventoryType } from "./slot-occupancy.js";

/** How capacity is represented for a bookable inventory row. */
export type BookableUnitKind = "STATIC_FACE" | "KIOSK" | "DIGITAL_SLOTS";

export type KioskSideMode = "ONE_SIDED" | "DUAL_SIDED" | "EITHER";

export type BookableUnitBucket = "hoarding" | "digital" | "kiosk" | "other";

export type BookableUnitSpec = {
  kind: BookableUnitKind;
  bucket: BookableUnitBucket;
  /** Concurrent commercial capacity (faces, sides, or digital slots). */
  capacity: number;
  /** Sides this unit supports (1 = single face; 2 = dual-capable hardware). */
  sidesSupported: 1 | 2;
  /** Whether a dual-sided package may be sold against this unit. */
  allowsDualPackage: boolean;
  /**
   * IDENTIFIED: this inventory row is a specific face/unit.
   * POOLED: capacity is a quantity pool on the row (no per-kiosk identity).
   */
  pooling: "IDENTIFIED" | "POOLED";
  /** Capacity is explicit on the inventory row (not inferred). */
  capacityConfigured: boolean;
};

function bucketForType(type?: string | null): BookableUnitBucket {
  const value = (type ?? "").toUpperCase();
  if (value.includes("KIOSK") || value === "STANDEE") return "kiosk";
  if (value.includes("DIGITAL")) return "digital";
  if (
    value.includes("STATIC") ||
    value === "UNIPOLE" ||
    value === "GANTRY" ||
    value.includes("HOARDING") ||
    value === "STATIC_BILLBOARD" ||
    value.includes("BUS_SHELTER")
  ) {
    return "hoarding";
  }
  return "other";
}

/**
 * Resolve bookable-unit semantics from inventory type + specs.
 * Dual-sided packages consume 2 units of capacity atomically on the same row
 * (or require booking both identified face rows when pooling=IDENTIFIED and sides=1 each).
 */
export function resolveBookableUnit(input: {
  inventoryType?: string | null;
  slotCapacity?: number | null;
  staticSpecsJson?: unknown;
}): BookableUnitSpec {
  const bucket = bucketForType(input.inventoryType);
  const specs = parseInventorySpecsJson(input.staticSpecsJson);
  const production =
    specs?.production && typeof specs.production === "object"
      ? (specs.production as Record<string, unknown>)
      : null;

  const specsRec = (specs ?? null) as Record<string, unknown> | null;
  const sidesRaw =
    (typeof specsRec?.sides === "number" ? specsRec.sides : null) ??
    (typeof production?.sides === "number" ? production.sides : null) ??
    (typeof specsRec?.sideCount === "number" ? specsRec.sideCount : null);

  const sidesSupported: 1 | 2 = sidesRaw === 2 ? 2 : 1;

  const dualFlag =
    (specs as { supportsDualSidedPackage?: unknown } | null)?.supportsDualSidedPackage === true ||
    production?.supportsDualSidedPackage === true ||
    (input.inventoryType ?? "").toUpperCase().includes("DUAL");

  const poolingRaw =
    (specs as { pooling?: unknown } | null)?.pooling ?? production?.pooling;
  const pooling: "IDENTIFIED" | "POOLED" =
    poolingRaw === "POOLED" || poolingRaw === "pooled" ? "POOLED" : "IDENTIFIED";

  const configured =
    typeof input.slotCapacity === "number" &&
    Number.isFinite(input.slotCapacity) &&
    input.slotCapacity >= 1;
  const capacity = effectiveSlotCapacity(input.inventoryType, input.slotCapacity);

  let kind: BookableUnitKind = "STATIC_FACE";
  if (bucket === "kiosk") kind = "KIOSK";
  else if (bucket === "digital" || isDigitalInventoryType(input.inventoryType)) kind = "DIGITAL_SLOTS";

  // Dual package only when hardware/config explicitly allows it — never assume every kiosk is dual.
  const allowsDualPackage =
    kind === "KIOSK" || kind === "STATIC_FACE"
      ? dualFlag || (sidesSupported === 2 && capacity >= 2)
      : false;

  return {
    kind,
    bucket,
    capacity,
    sidesSupported,
    allowsDualPackage,
    pooling,
    capacityConfigured: configured,
  };
}

/** Slots/faces consumed by a request against a bookable unit. */
export function slotsConsumedForRequest(input: {
  unit: BookableUnitSpec;
  /** Requested digital slots or kiosk quantity (default 1). */
  quantity?: number | null;
  /** Request dual-sided package when supported. */
  dualSidedPackage?: boolean;
}): number {
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  if (input.dualSidedPackage) {
    if (!input.unit.allowsDualPackage) {
      throw new Error("DUAL_SIDED_NOT_SUPPORTED");
    }
    // Dual package consumes both sides atomically (2 units per package × quantity).
    return 2 * qty;
  }
  return qty;
}

export function bookableUnitLabel(unit: BookableUnitSpec): string {
  switch (unit.kind) {
    case "DIGITAL_SLOTS":
      return unit.capacityConfigured
        ? `Digital slots (${unit.capacity} configured)`
        : "Digital slots (capacity unconfigured)";
    case "KIOSK":
      if (unit.pooling === "POOLED") {
        return `Kiosk pool × ${unit.capacity}`;
      }
      return unit.sidesSupported === 2 ? "Kiosk (dual-capable)" : "Kiosk (one-sided)";
    default:
      return "Static face";
  }
}
