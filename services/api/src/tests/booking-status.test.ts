import { describe, expect, it } from "vitest";
import { bookingStatusForItems } from "../lib/booking/status.js";
import { defaultHoldExpiry } from "../lib/booking/reserve.js";
import { INVENTORY_HOLD_TTL_MINUTES } from "@skyarc/shared";

describe("bookingStatusForItems", () => {
  it("returns CANCELLED when no active items", () => {
    expect(bookingStatusForItems([])).toBe("CANCELLED");
    expect(bookingStatusForItems(["CANCELLED", "REJECTED"])).toBe("CANCELLED");
  });

  it("returns CONFIRMED when all active items confirmed", () => {
    expect(bookingStatusForItems(["CONFIRMED", "CONFIRMED"])).toBe("CONFIRMED");
    expect(bookingStatusForItems(["CONFIRMED", "CANCELLED"])).toBe("CONFIRMED");
  });

  it("returns PARTIALLY_APPROVED for mixed vendor outcomes", () => {
    expect(
      bookingStatusForItems(["CONFIRMED", "PENDING_VENDOR_APPROVAL"])
    ).toBe("PARTIALLY_APPROVED");
    expect(bookingStatusForItems(["APPROVED", "HELD"])).toBe("PARTIALLY_APPROVED");
  });

  it("returns PENDING_VENDOR_APPROVAL when all pending", () => {
    expect(
      bookingStatusForItems(["PENDING_VENDOR_APPROVAL", "PENDING_VENDOR_APPROVAL"])
    ).toBe("PENDING_VENDOR_APPROVAL");
  });

  it("returns HELD for soft holds", () => {
    expect(bookingStatusForItems(["HELD", "HELD"])).toBe("HELD");
  });
});

describe("defaultHoldExpiry", () => {
  it("expires after configured TTL minutes", () => {
    const from = new Date("2026-10-02T10:00:00.000Z");
    const exp = defaultHoldExpiry(from);
    expect(exp.getTime() - from.getTime()).toBe(INVENTORY_HOLD_TTL_MINUTES * 60_000);
  });
});
