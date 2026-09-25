/** Default concurrent brands on a digital loop when capacity is unset / 1. */
export const DEFAULT_DIGITAL_SLOT_CAPACITY = 6;

/** Soft hold TTL while sales reps pitch (minutes). */
export const INVENTORY_HOLD_TTL_MINUTES = 30;

export function isDigitalInventoryType(inventoryType?: string | null): boolean {
  return (inventoryType ?? "").toUpperCase().includes("DIGITAL");
}

/**
 * Effective concurrent capacity for a face.
 * Digital: Prisma default 1 means use loop default (6); explicit >1 wins.
 * Static / other: 1 exclusive face.
 */
export function effectiveSlotCapacity(
  inventoryType?: string | null,
  slotCapacity?: number | null
): number {
  if (isDigitalInventoryType(inventoryType)) {
    if (typeof slotCapacity === "number" && slotCapacity > 1) {
      return Math.max(1, Math.floor(slotCapacity));
    }
    return DEFAULT_DIGITAL_SLOT_CAPACITY;
  }
  if (typeof slotCapacity === "number" && slotCapacity >= 1) {
    return Math.max(1, Math.floor(slotCapacity));
  }
  return 1;
}

export type SlotWindowLike = {
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  slotsConsumed?: number | null;
  expiresAt?: Date | string | null;
  notes?: string | null;
};

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function windowIsActiveHold(
  window: SlotWindowLike,
  now: Date = new Date()
): boolean {
  if (window.status !== "HELD") return false;
  if (!window.expiresAt) return true;
  return asDate(window.expiresAt) > now;
}

export function windowConsumesSlots(
  window: SlotWindowLike,
  now: Date = new Date()
): boolean {
  if (window.status === "BOOKED" || window.status === "BLOCKED") return true;
  if (window.status === "HELD") return windowIsActiveHold(window, now);
  return false;
}

export function slotsConsumedForFlight(
  windows: SlotWindowLike[] | undefined,
  startDate: Date,
  endDate: Date,
  opts?: { now?: Date; ignoreNotesContaining?: string }
): number {
  const now = opts?.now ?? new Date();
  let used = 0;
  for (const window of windows ?? []) {
    if (!windowConsumesSlots(window, now)) continue;
    if (
      opts?.ignoreNotesContaining &&
      window.notes &&
      window.notes.includes(opts.ignoreNotesContaining)
    ) {
      continue;
    }
    const wStart = asDate(window.startDate);
    const wEnd = asDate(window.endDate);
    if (startDate < wEnd && endDate > wStart) {
      used += Math.max(1, window.slotsConsumed ?? 1);
    }
  }
  return used;
}

export function slotOccupancy(input: {
  inventoryType?: string | null;
  slotCapacity?: number | null;
  availabilityWindows?: SlotWindowLike[];
  startDate: Date;
  endDate: Date;
  now?: Date;
  ignoreNotesContaining?: string;
}): {
  capacity: number;
  used: number;
  remaining: number;
  slots: Array<"available" | "booked">;
  fullyBooked: boolean;
} {
  const capacity = effectiveSlotCapacity(input.inventoryType, input.slotCapacity);
  const used = Math.min(
    capacity,
    slotsConsumedForFlight(input.availabilityWindows, input.startDate, input.endDate, {
      now: input.now,
      ignoreNotesContaining: input.ignoreNotesContaining,
    })
  );
  const remaining = Math.max(0, capacity - used);
  const slots = Array.from({ length: capacity }, (_, i) =>
    i < used ? ("booked" as const) : ("available" as const)
  );
  return {
    capacity,
    used,
    remaining,
    slots,
    fullyBooked: remaining <= 0,
  };
}

/** Earliest date where at least one slot is free for `durationDays`. */
export function earliestVacancyStart(input: {
  inventoryType?: string | null;
  slotCapacity?: number | null;
  availabilityWindows?: SlotWindowLike[];
  durationDays: number;
  searchFrom?: Date;
  searchHorizonDays?: number;
  now?: Date;
}): Date | null {
  const durationDays = Math.max(1, Math.floor(input.durationDays));
  const horizon = input.searchHorizonDays ?? 180;
  const start = new Date(input.searchFrom ?? input.now ?? new Date());
  start.setHours(0, 0, 0, 0);

  for (let offset = 0; offset <= horizon; offset += 1) {
    const candidateStart = new Date(start);
    candidateStart.setDate(candidateStart.getDate() + offset);
    const candidateEnd = new Date(candidateStart);
    candidateEnd.setDate(candidateEnd.getDate() + durationDays);
    const occ = slotOccupancy({
      inventoryType: input.inventoryType,
      slotCapacity: input.slotCapacity,
      availabilityWindows: input.availabilityWindows,
      startDate: candidateStart,
      endDate: candidateEnd,
      now: input.now,
    });
    if (!occ.fullyBooked) return candidateStart;
  }
  return null;
}

export type LiveBookingStatus = "AVAILABLE" | "ON_HOLD" | "UNAVAILABLE" | "PARTIAL";

/** Summarize a location’s faces for sales pitching UI. */
export function summarizeLocationLiveInventory(input: {
  inventories: Array<{
    inventoryType?: string | null;
    slotCapacity?: number | null;
    status: string;
    availabilityWindows?: SlotWindowLike[];
  }>;
  startDate: Date;
  endDate: Date;
  now?: Date;
}): {
  status: LiveBookingStatus;
  isDigital: boolean;
  capacity: number;
  used: number;
  remaining: number;
  indicators: Array<"available" | "booked">;
  earliestVacancyDate: string | null;
} | null {
  const faces = input.inventories.filter(
    (inv) => inv.status === "AVAILABLE" || inv.status === "UNKNOWN"
  );
  if (faces.length === 0) {
    return {
      status: "UNAVAILABLE",
      isDigital: false,
      capacity: 1,
      used: 1,
      remaining: 0,
      indicators: ["booked"],
      earliestVacancyDate: null,
    };
  }

  const digital = faces.find((f) => isDigitalInventoryType(f.inventoryType));
  const primary = digital ?? faces[0]!;
  const isDigital = isDigitalInventoryType(primary.inventoryType);
  const occ = slotOccupancy({
    inventoryType: primary.inventoryType,
    slotCapacity: primary.slotCapacity,
    availabilityWindows: primary.availabilityWindows,
    startDate: input.startDate,
    endDate: input.endDate,
    now: input.now,
  });

  const durationDays = Math.max(
    1,
    Math.round((input.endDate.getTime() - input.startDate.getTime()) / 86_400_000)
  );
  const vacancy = occ.fullyBooked
    ? earliestVacancyStart({
        inventoryType: primary.inventoryType,
        slotCapacity: primary.slotCapacity,
        availabilityWindows: primary.availabilityWindows,
        durationDays,
        searchFrom: input.startDate,
        now: input.now,
      })
    : null;

  let status: LiveBookingStatus;
  if (occ.fullyBooked) status = "UNAVAILABLE";
  else if (occ.used > 0 && isDigital) status = "PARTIAL";
  else if (occ.used > 0) status = "ON_HOLD";
  else status = "AVAILABLE";

  // Static exclusive: if any overlapping HELD (active) without BOOKED → ON_HOLD
  if (!isDigital && occ.used > 0 && !occ.fullyBooked) {
    status = "ON_HOLD";
  }

  return {
    status,
    isDigital,
    capacity: occ.capacity,
    used: occ.used,
    remaining: occ.remaining,
    indicators: occ.slots,
    earliestVacancyDate: vacancy ? vacancy.toISOString().slice(0, 10) : null,
  };
}
