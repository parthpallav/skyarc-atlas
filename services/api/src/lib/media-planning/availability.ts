export function windowsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date
): boolean {
  return startA < endB && endA > startB;
}

export function isInventoryFreeForFlight(
  inventory: {
    status: string;
    availabilityWindows?: Array<{
      startDate: Date;
      endDate: Date;
      status: string;
    }>;
  },
  startDate?: Date | null,
  endDate?: Date | null
): boolean {
  if (inventory.status !== "AVAILABLE") return false;
  if (!startDate || !endDate) return true;

  const blockers = (inventory.availabilityWindows ?? []).filter(
    (window) => window.status === "BLOCKED" || window.status === "BOOKED"
  );
  return !blockers.some((window) =>
    windowsOverlap(startDate, endDate, window.startDate, window.endDate)
  );
}
