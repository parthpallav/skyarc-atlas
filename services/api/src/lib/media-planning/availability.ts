import {
  effectiveSlotCapacity,
  slotsConsumedForFlight,
  windowIsActiveHold,
} from "@skyarc/shared";

export function windowsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA < endB && endA > startB;
}

export function campaignWindowNote(campaignId: string, kind: "hold" | "book"): string {
  return kind === "book"
    ? `Booked for campaign ${campaignId}`
    : `Held for campaign ${campaignId}`;
}

export function windowBelongsToCampaign(
  notes: string | null | undefined,
  campaignId: string
): boolean {
  return Boolean(notes && notes.includes(campaignId));
}

const BLOCKING_WINDOW_STATUSES = new Set(["BLOCKED", "HELD", "BOOKED"]);

export function isInventoryFreeForFlight(
  inventory: {
    status: string;
    screenStatus?: string | null;
    inventoryType?: string | null;
    slotCapacity?: number | null;
    availabilityWindows?: Array<{
      startDate: Date;
      endDate: Date;
      status: string;
      notes?: string | null;
      slotsConsumed?: number | null;
      expiresAt?: Date | string | null;
    }>;
  },
  startDate?: Date | null,
  endDate?: Date | null,
  opts?: { allowHeldForCampaignId?: string; slotsNeeded?: number }
): boolean {
  if (inventory.status === "UNAVAILABLE") return false;
  if (inventory.status !== "AVAILABLE" && inventory.status !== "UNKNOWN") return false;
  if (inventory.screenStatus === "UNAVAILABLE") return false;
  if (!startDate || !endDate) return true;

  const capacity = effectiveSlotCapacity(inventory.inventoryType, inventory.slotCapacity);
  const slotsNeeded = Math.max(1, opts?.slotsNeeded ?? 1);

  const windows = (inventory.availabilityWindows ?? []).filter((window) => {
    if (window.status === "HELD" && !windowIsActiveHold(window)) return false;
    return true;
  });

  const used = slotsConsumedForFlight(windows, startDate, endDate, {
    ignoreNotesContaining: opts?.allowHeldForCampaignId,
  });

  if (capacity > 1) {
    return used + slotsNeeded <= capacity;
  }

  const blockers = windows.filter((window) => {
    if (!BLOCKING_WINDOW_STATUSES.has(window.status)) return false;
    if (
      window.status === "HELD" &&
      opts?.allowHeldForCampaignId &&
      windowBelongsToCampaign(window.notes, opts.allowHeldForCampaignId)
    ) {
      return false;
    }
    return true;
  });
  return !blockers.some((window) =>
    windowsOverlap(startDate, endDate, window.startDate, window.endDate)
  );
}
