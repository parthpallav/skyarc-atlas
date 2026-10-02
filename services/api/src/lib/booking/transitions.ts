/**
 * Allowed booking/item transitions — no generic status PATCH.
 */

export type BookingItemStatus =
  | "REQUESTED"
  | "HELD"
  | "PENDING_VENDOR_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CONFIRMED"
  | "EXPIRED"
  | "CANCELLED";

const ITEM_TRANSITIONS: Record<BookingItemStatus, Set<BookingItemStatus>> = {
  REQUESTED: new Set(["HELD", "PENDING_VENDOR_APPROVAL", "CONFIRMED", "CANCELLED"]),
  HELD: new Set(["CONFIRMED", "PENDING_VENDOR_APPROVAL", "EXPIRED", "CANCELLED", "REJECTED"]),
  PENDING_VENDOR_APPROVAL: new Set(["CONFIRMED", "REJECTED", "EXPIRED", "CANCELLED"]),
  APPROVED: new Set(["CONFIRMED", "CANCELLED"]),
  REJECTED: new Set(["HELD", "PENDING_VENDOR_APPROVAL", "CONFIRMED"]),
  CONFIRMED: new Set(["CANCELLED"]),
  // Soft-hold expiry may be re-reserved on the same booking row
  EXPIRED: new Set(["HELD", "PENDING_VENDOR_APPROVAL", "CONFIRMED", "CANCELLED"]),
  CANCELLED: new Set(["HELD", "PENDING_VENDOR_APPROVAL", "CONFIRMED"]),
};

export function assertItemTransition(from: string, to: string): void {
  const allowed = ITEM_TRANSITIONS[from as BookingItemStatus];
  if (!allowed || !allowed.has(to as BookingItemStatus)) {
    throw new Error(`Invalid item transition ${from} → ${to}`);
  }
}

export function canItemTransition(from: string, to: string): boolean {
  try {
    assertItemTransition(from, to);
    return true;
  } catch {
    return false;
  }
}
