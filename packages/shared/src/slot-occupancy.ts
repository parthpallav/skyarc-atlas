/** Default concurrent brands on a digital loop when capacity is unset / 1. */
export const DEFAULT_DIGITAL_SLOT_CAPACITY = 6;

/** Soft hold TTL while sales reps pitch (minutes). */
export const INVENTORY_HOLD_TTL_MINUTES = 30;

export function isDigitalInventoryType(inventoryType?: string | null): boolean {
  const value = (inventoryType ?? "").toUpperCase();
  // Kiosk faces are digital loops even though the type string may not contain "DIGITAL".
  return value.includes("DIGITAL") || value.includes("KIOSK") || value === "STANDEE";
}

/**
 * Effective concurrent capacity for a face.
 * Digital: configured values above 1 are honored; 1/null use the product loop default (6)
 * so legacy Prisma `@default(1)` rows still behave as a multi-brand loop until edited.
 * Static / other: 1 exclusive face (or explicit capacity when set).
 */
export function effectiveSlotCapacity(
  inventoryType?: string | null,
  slotCapacity?: number | null
): number {
  if (isDigitalInventoryType(inventoryType)) {
    if (typeof slotCapacity === "number" && slotCapacity > 1) {
      return Math.max(2, Math.floor(slotCapacity));
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

  const scored = faces.map((face) => {
    const isDigital = isDigitalInventoryType(face.inventoryType);
    const occ = slotOccupancy({
      inventoryType: face.inventoryType,
      slotCapacity: face.slotCapacity,
      availabilityWindows: face.availabilityWindows,
      startDate: input.startDate,
      endDate: input.endDate,
      now: input.now,
    });
    return { face, isDigital, occ };
  });

  // Prefer an open digital face for slot UI; otherwise any open face; else any digital.
  const open = scored.filter((row) => !row.occ.fullyBooked);
  const primary =
    open.find((row) => row.isDigital) ??
    open[0] ??
    scored.find((row) => row.isDigital) ??
    scored[0]!;

  const durationDays = Math.max(
    1,
    Math.round((input.endDate.getTime() - input.startDate.getTime()) / 86_400_000)
  );
  const vacancy = primary.occ.fullyBooked
    ? earliestVacancyStart({
        inventoryType: primary.face.inventoryType,
        slotCapacity: primary.face.slotCapacity,
        availabilityWindows: primary.face.availabilityWindows,
        durationDays,
        searchFrom: input.startDate,
        now: input.now,
      })
    : null;

  let status: LiveBookingStatus;
  if (open.length === 0) {
    status = "UNAVAILABLE";
  } else if (open.some((row) => row.occ.used === 0)) {
    status = "AVAILABLE";
  } else if (open.some((row) => row.isDigital)) {
    status = "PARTIAL";
  } else {
    status = "ON_HOLD";
  }

  return {
    status,
    isDigital: primary.isDigital,
    capacity: primary.occ.capacity,
    used: primary.occ.used,
    remaining: primary.occ.remaining,
    indicators: primary.occ.slots,
    earliestVacancyDate: vacancy ? vacancy.toISOString().slice(0, 10) : null,
  };
}
