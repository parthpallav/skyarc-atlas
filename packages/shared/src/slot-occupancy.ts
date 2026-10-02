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

/**
 * Peak concurrent slots consumed during [startDate, endDate].
 * Non-overlapping bookings must not sum — only concurrent load counts.
 */
export function slotsConsumedForFlight(
  windows: SlotWindowLike[] | undefined,
  startDate: Date,
  endDate: Date,
  opts?: { now?: Date; ignoreNotesContaining?: string }
): number {
  const now = opts?.now ?? new Date();
  const flightStart = startDate.getTime();
  const flightEnd = endDate.getTime();
  if (!(flightStart < flightEnd)) return 0;

  type SweepEvent = { at: number; delta: number };
  const events: SweepEvent[] = [];

  for (const window of windows ?? []) {
    if (!windowConsumesSlots(window, now)) continue;
    if (
      opts?.ignoreNotesContaining &&
      window.notes &&
      window.notes.includes(opts.ignoreNotesContaining)
    ) {
      continue;
    }
    const wStart = asDate(window.startDate).getTime();
    const wEnd = asDate(window.endDate).getTime();
    // Half-open overlap with the requested flight
    const overlapStart = Math.max(wStart, flightStart);
    const overlapEnd = Math.min(wEnd, flightEnd);
    if (!(overlapStart < overlapEnd)) continue;

    const slots = Math.max(1, window.slotsConsumed ?? 1);
    events.push({ at: overlapStart, delta: slots });
    events.push({ at: overlapEnd, delta: -slots });
  }

  // At equal timestamps, release (-delta) before acquire (+delta) so abutting windows do not stack.
  events.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.delta - b.delta));

  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

function peakSlotsForFlight(
  windows: SlotWindowLike[] | undefined,
  startDate: Date,
  endDate: Date,
  includeWindow: (window: SlotWindowLike, now: Date) => boolean,
  opts?: { now?: Date; ignoreNotesContaining?: string }
): number {
  const now = opts?.now ?? new Date();
  const flightStart = startDate.getTime();
  const flightEnd = endDate.getTime();
  if (!(flightStart < flightEnd)) return 0;

  type SweepEvent = { at: number; delta: number };
  const events: SweepEvent[] = [];

  for (const window of windows ?? []) {
    if (!includeWindow(window, now)) continue;
    if (
      opts?.ignoreNotesContaining &&
      window.notes &&
      window.notes.includes(opts.ignoreNotesContaining)
    ) {
      continue;
    }
    const wStart = asDate(window.startDate).getTime();
    const wEnd = asDate(window.endDate).getTime();
    const overlapStart = Math.max(wStart, flightStart);
    const overlapEnd = Math.min(wEnd, flightEnd);
    if (!(overlapStart < overlapEnd)) continue;

    const slots = Math.max(1, window.slotsConsumed ?? 1);
    events.push({ at: overlapStart, delta: slots });
    events.push({ at: overlapEnd, delta: -slots });
  }

  events.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.delta - b.delta));

  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

export type FlightOccupancyBreakdown = {
  capacity: number;
  /** Peak concurrent held slots during the flight (active holds only). */
  held: number;
  /** Peak concurrent booked slots during the flight. */
  booked: number;
  /** Peak concurrent blocked slots during the flight. */
  blocked: number;
  /** Total peak concurrent load (held + booked + blocked, capped at capacity). */
  used: number;
  available: number;
};

/** Peak occupancy by authoritative window status for a flight window. */
export function flightOccupancyBreakdown(input: {
  inventoryType?: string | null;
  slotCapacity?: number | null;
  availabilityWindows?: SlotWindowLike[];
  startDate: Date;
  endDate: Date;
  now?: Date;
  ignoreNotesContaining?: string;
}): FlightOccupancyBreakdown {
  const capacity = effectiveSlotCapacity(input.inventoryType, input.slotCapacity);
  const sweepOpts = {
    now: input.now,
    ignoreNotesContaining: input.ignoreNotesContaining,
  };
  const held = peakSlotsForFlight(
    input.availabilityWindows,
    input.startDate,
    input.endDate,
    (w, now) => w.status === "HELD" && windowIsActiveHold(w, now),
    sweepOpts
  );
  const booked = peakSlotsForFlight(
    input.availabilityWindows,
    input.startDate,
    input.endDate,
    (w) => w.status === "BOOKED",
    sweepOpts
  );
  const blocked = peakSlotsForFlight(
    input.availabilityWindows,
    input.startDate,
    input.endDate,
    (w) => w.status === "BLOCKED",
    sweepOpts
  );
  const used = Math.min(
    capacity,
    slotsConsumedForFlight(input.availabilityWindows, input.startDate, input.endDate, sweepOpts)
  );
  const available = Math.max(0, capacity - used);
  return { capacity, held, booked, blocked, used, available };
}

export type DailyOccupancyPoint = {
  /** Calendar day (UTC date). */
  date: string;
  peakUsed: number;
  remaining: number;
  capacity: number;
};

/**
 * Per-day peak concurrent load for the selected flight.
 * Each point covers [date, date+1 day) intersected with the flight.
 */
export function dailyOccupancySeries(input: {
  inventoryType?: string | null;
  slotCapacity?: number | null;
  availabilityWindows?: SlotWindowLike[];
  startDate: Date;
  endDate: Date;
  now?: Date;
}): DailyOccupancyPoint[] {
  const capacity = effectiveSlotCapacity(input.inventoryType, input.slotCapacity);
  const series: DailyOccupancyPoint[] = [];
  const cursor = new Date(input.startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const flightEnd = input.endDate.getTime();

  while (cursor.getTime() < flightEnd) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const sliceStart = new Date(Math.max(dayStart.getTime(), input.startDate.getTime()));
    const sliceEnd = new Date(Math.min(dayEnd.getTime(), flightEnd));
    if (sliceStart.getTime() < sliceEnd.getTime()) {
      const peakUsed = Math.min(
        capacity,
        slotsConsumedForFlight(input.availabilityWindows, sliceStart, sliceEnd, {
          now: input.now,
        })
      );
      series.push({
        date: dayStart.toISOString().slice(0, 10),
        peakUsed,
        remaining: Math.max(0, capacity - peakUsed),
        capacity,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

/** Capacity-unit indicator states for UI (not named advertiser assignments). */
export type CapacityUnitState = "available" | "held" | "booked" | "blocked";

export function capacityUnitIndicators(breakdown: FlightOccupancyBreakdown): CapacityUnitState[] {
  const { capacity, held, booked, blocked, used } = breakdown;
  const units: CapacityUnitState[] = [];
  const assign = (state: CapacityUnitState, count: number) => {
    for (let i = 0; i < count; i += 1) units.push(state);
  };
  assign("booked", Math.min(booked, used));
  assign("held", Math.min(held, Math.max(0, used - units.length)));
  assign("blocked", Math.min(blocked, Math.max(0, used - units.length)));
  while (units.length < used && units.length < capacity) {
    units.push("booked");
  }
  while (units.length < capacity) {
    units.push("available");
  }
  return units.slice(0, capacity);
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
export type LiveInventoryPlaybackSpec = {
  operatingHours: unknown | null;
  operatingHoursAvailable: boolean;
  loopDurationSec: number | null;
  slotDurationSec: number | null;
  defaultCreativeDurationSec: number | null;
};

export function summarizeLocationLiveInventory(input: {
  inventories: Array<{
    inventoryType?: string | null;
    slotCapacity?: number | null;
    status: string;
    availabilityWindows?: SlotWindowLike[];
    screen?: {
      operatingHoursJson?: unknown;
      loopDurationSec?: number | null;
      slotDurationSec?: number | null;
    };
  }>;
  startDate: Date;
  endDate: Date;
  now?: Date;
  computedAt?: Date;
}): {
  status: LiveBookingStatus;
  isDigital: boolean;
  capacity: number;
  used: number;
  remaining: number;
  indicators: Array<"available" | "booked">;
  unitIndicators: CapacityUnitState[];
  breakdown: FlightOccupancyBreakdown;
  dailySeries: DailyOccupancyPoint[];
  earliestVacancyDate: string | null;
  computedAt: string;
  scope: "flight";
  playbackSpec: LiveInventoryPlaybackSpec;
} | null {
  const faces = input.inventories.filter(
    (inv) => inv.status === "AVAILABLE" || inv.status === "UNKNOWN"
  );
  const computedAt = (input.computedAt ?? input.now ?? new Date()).toISOString();

  if (faces.length === 0) {
    const breakdown: FlightOccupancyBreakdown = {
      capacity: 1,
      held: 0,
      booked: 1,
      blocked: 0,
      used: 1,
      available: 0,
    };
    return {
      status: "UNAVAILABLE",
      isDigital: false,
      capacity: 1,
      used: 1,
      remaining: 0,
      indicators: ["booked"],
      unitIndicators: ["booked"],
      breakdown,
      dailySeries: [],
      earliestVacancyDate: null,
      computedAt,
      scope: "flight",
      playbackSpec: {
        operatingHours: null,
        operatingHoursAvailable: false,
        loopDurationSec: null,
        slotDurationSec: null,
        defaultCreativeDurationSec: null,
      },
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
  } else if (
    scored.some((row) =>
      row.face.availabilityWindows?.some(
        (w) => w.status === "HELD" && windowIsActiveHold(w, input.now ?? new Date())
      )
    )
  ) {
    status = "ON_HOLD";
  } else {
    status = "PARTIAL";
  }

  const breakdown = flightOccupancyBreakdown({
    inventoryType: primary.face.inventoryType,
    slotCapacity: primary.face.slotCapacity,
    availabilityWindows: primary.face.availabilityWindows,
    startDate: input.startDate,
    endDate: input.endDate,
    now: input.now,
  });
  const dailySeries = dailyOccupancySeries({
    inventoryType: primary.face.inventoryType,
    slotCapacity: primary.face.slotCapacity,
    availabilityWindows: primary.face.availabilityWindows,
    startDate: input.startDate,
    endDate: input.endDate,
    now: input.now,
  });
  const screen = primary.face.screen;
  const loopDurationSec = screen?.loopDurationSec ?? null;
  const slotDurationSec = screen?.slotDurationSec ?? null;
  const operatingHoursJson = screen?.operatingHoursJson;
  const operatingHoursAvailable =
    operatingHoursJson !== null &&
    operatingHoursJson !== undefined &&
    typeof operatingHoursJson === "object";

  return {
    status,
    isDigital: primary.isDigital,
    capacity: primary.occ.capacity,
    used: primary.occ.used,
    remaining: primary.occ.remaining,
    indicators: primary.occ.slots,
    unitIndicators: capacityUnitIndicators(breakdown),
    breakdown,
    dailySeries,
    earliestVacancyDate: vacancy ? vacancy.toISOString().slice(0, 10) : null,
    computedAt,
    scope: "flight",
    playbackSpec: {
      operatingHours: operatingHoursAvailable ? operatingHoursJson : null,
      operatingHoursAvailable,
      loopDurationSec,
      slotDurationSec,
      defaultCreativeDurationSec: slotDurationSec ?? loopDurationSec ?? null,
    },
  };
}
