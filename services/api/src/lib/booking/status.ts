/**
 * Pure booking status helpers — kept free of Prisma for unit tests.
 */

export type BookingHoldMode = "hold" | "book";

export function itemStatusForMode(
  mode: BookingHoldMode,
  requireVendorApproval: boolean
): "HELD" | "PENDING_VENDOR_APPROVAL" | "CONFIRMED" {
  if (mode === "book") return "CONFIRMED";
  if (requireVendorApproval) return "PENDING_VENDOR_APPROVAL";
  return "HELD";
}

export function bookingStatusForItems(
  itemStatuses: string[]
): "HELD" | "PENDING_VENDOR_APPROVAL" | "PARTIALLY_APPROVED" | "CONFIRMED" | "EXPIRED" | "CANCELLED" {
  if (itemStatuses.length === 0) return "CANCELLED";
  const active = itemStatuses.filter(
    (s) => s !== "CANCELLED" && s !== "REJECTED" && s !== "EXPIRED"
  );
  if (active.length === 0) {
    return itemStatuses.some((s) => s === "EXPIRED") ? "EXPIRED" : "CANCELLED";
  }
  if (active.every((s) => s === "CONFIRMED")) return "CONFIRMED";
  if (
    active.some((s) => s === "CONFIRMED" || s === "APPROVED") &&
    active.some((s) => s === "PENDING_VENDOR_APPROVAL" || s === "HELD" || s === "REQUESTED")
  ) {
    return "PARTIALLY_APPROVED";
  }
  if (active.every((s) => s === "PENDING_VENDOR_APPROVAL")) return "PENDING_VENDOR_APPROVAL";
  if (active.every((s) => s === "APPROVED" || s === "CONFIRMED")) {
    return active.every((s) => s === "CONFIRMED") ? "CONFIRMED" : "PARTIALLY_APPROVED";
  }
  return "HELD";
}
