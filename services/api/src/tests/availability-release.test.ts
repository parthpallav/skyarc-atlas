import { describe, expect, it } from "vitest";
import { flightBounds } from "../lib/availability-release.js";

describe("flightBounds", () => {
  it("builds inclusive UTC day bounds", () => {
    const { start, end } = flightBounds("2026-10-01", "2026-10-15");
    expect(start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-15T23:59:59.999Z");
  });
});
