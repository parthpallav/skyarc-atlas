import { slotOccupancy, windowIsActiveHold } from "@skyarc/shared";

export type CalendarWindow = {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  slotsConsumed: number;
  expiresAt: string | null;
  campaignId: string | null;
  staleHold: boolean;
};

export type InventoryCalendarDay = {
  date: string;
  peakSlotsUsed: number;
  slotCapacity: number;
  remaining: number;
  windows: CalendarWindow[];
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build day buckets for a flight range (commercial capacity only — not device health). */
export function buildInventoryCalendar(input: {
  inventoryType: string;
  slotCapacity: number;
  availabilityConfirmedAt: Date | null;
  windows: Array<{
    id: string;
    startDate: Date;
    endDate: Date;
    status: string;
    slotsConsumed: number;
    expiresAt: Date | null;
    campaignId: string | null;
  }>;
  rangeStart: Date;
  rangeEnd: Date;
  now?: Date;
}): {
  availabilityConfirmedAt: string | null;
  freshnessStale: boolean;
  days: InventoryCalendarDay[];
} {
  const now = input.now ?? new Date();
  const staleDays = 14;
  const freshnessStale =
    !input.availabilityConfirmedAt ||
    now.getTime() - input.availabilityConfirmedAt.getTime() > staleDays * 86400000;

  const days: InventoryCalendarDay[] = [];
  const cursor = new Date(input.rangeStart);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(input.rangeEnd);
  end.setUTCHours(23, 59, 59, 999);

  while (cursor <= end) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const occ = slotOccupancy({
      inventoryType: input.inventoryType,
      slotCapacity: input.slotCapacity,
      availabilityWindows: input.windows.map((w) => ({
        startDate: w.startDate,
        endDate: w.endDate,
        status: w.status,
        slotsConsumed: w.slotsConsumed,
        expiresAt: w.expiresAt,
      })),
      startDate: dayStart,
      endDate: dayEnd,
    });

    const overlapping = input.windows.filter(
      (w) => w.startDate <= dayEnd && w.endDate >= dayStart
    );

    days.push({
      date: dayKey(dayStart),
      peakSlotsUsed: occ.used,
      slotCapacity: occ.capacity,
      remaining: occ.remaining,
      windows: overlapping.map((w) => ({
        id: w.id,
        startDate: w.startDate.toISOString(),
        endDate: w.endDate.toISOString(),
        status: w.status,
        slotsConsumed: w.slotsConsumed,
        expiresAt: w.expiresAt?.toISOString() ?? null,
        campaignId: w.campaignId,
        staleHold:
          w.status === "HELD" &&
          !windowIsActiveHold(
            {
              startDate: w.startDate,
              endDate: w.endDate,
              status: w.status,
              expiresAt: w.expiresAt,
            },
            now
          ),
      })),
    });

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    availabilityConfirmedAt: input.availabilityConfirmedAt?.toISOString() ?? null,
    freshnessStale,
    days,
  };
}
