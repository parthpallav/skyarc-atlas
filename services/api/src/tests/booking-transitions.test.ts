import { describe, expect, it } from "vitest";
import { assertItemTransition, canItemTransition } from "../lib/booking/transitions.js";

describe("booking item transitions", () => {
  it("allows hold → pending vendor approval", () => {
    expect(canItemTransition("HELD", "PENDING_VENDOR_APPROVAL")).toBe(true);
  });

  it("blocks arbitrary jumps", () => {
    expect(() => assertItemTransition("CONFIRMED", "HELD")).toThrow(/Invalid item transition/);
    expect(canItemTransition("CONFIRMED", "PENDING_VENDOR_APPROVAL")).toBe(false);
  });

  it("allows partial approval path", () => {
    expect(canItemTransition("PENDING_VENDOR_APPROVAL", "CONFIRMED")).toBe(true);
    expect(canItemTransition("PENDING_VENDOR_APPROVAL", "REJECTED")).toBe(true);
  });

  it("allows hold expiry and revive", () => {
    expect(canItemTransition("HELD", "EXPIRED")).toBe(true);
    expect(canItemTransition("PENDING_VENDOR_APPROVAL", "EXPIRED")).toBe(true);
    expect(canItemTransition("EXPIRED", "HELD")).toBe(true);
    expect(canItemTransition("REQUESTED", "CONFIRMED")).toBe(true);
  });
});
