import { describe, expect, it } from "vitest";
import {
  corridorSearchVariants,
  locationMatchesCorridor,
  normalizeCorridorKey,
} from "@skyarc/shared";

describe("corridor matching", () => {
  it("normalizes Feet vs ft", () => {
    expect(normalizeCorridorKey("150 Feet Ring Road")).toBe("150ft ring road");
    expect(normalizeCorridorKey("150ft Ring Road")).toBe("150ft ring road");
  });

  it("matches on road, not Facing address noise", () => {
    expect(locationMatchesCorridor({ road: "Kalawad Road" }, "Kalawad Road")).toBe(true);
    expect(locationMatchesCorridor({ road: "Kalawad Road" }, "Race Course")).toBe(false);
    expect(
      locationMatchesCorridor({ road: "150 Feet Ring Road" }, "150ft Ring Road")
    ).toBe(true);
  });

  it("builds Feet/ft search variants", () => {
    const v = corridorSearchVariants("150 Feet Ring Road");
    expect(v.some((x: string) => /150ft/i.test(x))).toBe(true);
  });
});
