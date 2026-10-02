/** Shape returned on location list/detail as `liveInventory`. */
export type LiveInventoryView = {
  status?: string;
  isDigital?: boolean;
  capacity?: number;
  used?: number;
  remaining?: number;
  indicators?: Array<"available" | "booked">;
  unitIndicators?: Array<"available" | "held" | "booked" | "blocked">;
  breakdown?: {
    capacity: number;
    held: number;
    booked: number;
    blocked: number;
    used: number;
    available: number;
  };
  dailySeries?: Array<{
    date: string;
    peakUsed: number;
    remaining: number;
    capacity: number;
  }>;
  earliestVacancyDate?: string | null;
  computedAt?: string;
  scope?: "flight";
  playbackSpec?: {
    operatingHours: unknown | null;
    operatingHoursAvailable: boolean;
    loopDurationSec: number | null;
    slotDurationSec: number | null;
    defaultCreativeDurationSec: number | null;
  };
};

export function parseLiveInventory(raw: unknown): LiveInventoryView | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return raw as LiveInventoryView;
}

export function dailySeriesIsUniform(series: LiveInventoryView["dailySeries"]): boolean {
  if (!series || series.length <= 1) return true;
  const first = series[0]!.peakUsed;
  return series.every((p) => p.peakUsed === first);
}
