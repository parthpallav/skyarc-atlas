import { describe, expect, it } from "vitest";
import { addMinor, fromMinorUnits, toMinorUnits, totalsMatch } from "../lib/booking/money.js";

describe("money minor units", () => {
  it("converts INR rupees to paise", () => {
    expect(toMinorUnits(10.5, "INR")).toBe(1050);
    expect(fromMinorUnits(1050, "INR")).toBe(10.5);
  });

  it("rounds to nearest paise", () => {
    expect(toMinorUnits(1.004, "INR")).toBe(100);
    expect(toMinorUnits(1.006, "INR")).toBe(101);
  });

  it("adds without float drift", () => {
    expect(addMinor(10, 20, 30)).toBe(60);
  });

  it("matches within tolerance for stale quote checks", () => {
    expect(totalsMatch(10000, 10000)).toBe(true);
    expect(totalsMatch(10000, 10001)).toBe(true);
    expect(totalsMatch(10000, 10002)).toBe(false);
  });
});
