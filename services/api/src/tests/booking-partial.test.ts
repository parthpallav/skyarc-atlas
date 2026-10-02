import { describe, expect, it } from "vitest";
import { bookingStatusForItems } from "../lib/booking/status.js";

/**
 * Behavioural contracts for partial vendor approval and cancellation
 * without requiring a live database.
 */
describe("booking partial approval contracts", () => {
  it("keeps PARTIALLY_APPROVED when some sites confirmed and others pending", () => {
    expect(
      bookingStatusForItems([
        "CONFIRMED",
        "PENDING_VENDOR_APPROVAL",
        "PENDING_VENDOR_APPROVAL",
      ])
    ).toBe("PARTIALLY_APPROVED");
  });

  it("ignores rejected/cancelled when computing remaining active status", () => {
    expect(
      bookingStatusForItems(["CONFIRMED", "REJECTED", "CANCELLED"])
    ).toBe("CONFIRMED");
  });

  it("becomes CANCELLED only when nothing active remains", () => {
    expect(bookingStatusForItems(["REJECTED", "CANCELLED"])).toBe("CANCELLED");
  });
});
