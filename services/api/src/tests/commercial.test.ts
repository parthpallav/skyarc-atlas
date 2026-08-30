import { describe, expect, it } from "vitest";
import {
  clientRateFromVendorRate,
  deriveSkyarcMarginPercent,
  resolveMarginPercent,
  resolveEffectiveLocationCommercial,
  DEFAULT_PLATFORM_CONFIG,
} from "@skyarc/shared";

describe("commercial pricing", () => {
  it("uses org override over platform default", () => {
    expect(
      resolveMarginPercent({ skyarcMarginPercent: 18 }, DEFAULT_PLATFORM_CONFIG)
    ).toBe(18);
    expect(resolveMarginPercent({}, DEFAULT_PLATFORM_CONFIG)).toBe(15);
  });

  it("derives implied margin from explicit vendor and client rates", () => {
    expect(deriveSkyarcMarginPercent(100_000, 150_000)).toBeCloseTo(33.3, 1);
    expect(deriveSkyarcMarginPercent(100_000, 100_000)).toBeNull();
  });

  it("legacy formula helper still available for reference", () => {
    const vendorRate = 50_000;
    const clientRate = clientRateFromVendorRate(vendorRate, 20);
    expect(clientRate).toBeCloseTo(62_500, 0);
  });

  it("resolves location commercial with org default fallback", () => {
    const effective = resolveEffectiveLocationCommercial(
      {},
      { defaultMarginPercent: 12, currency: "INR" },
      DEFAULT_PLATFORM_CONFIG
    );
    expect(effective.marginPercent).toBe(12);
    expect(effective.usesOrgDefaultMargin).toBe(true);

    const override = resolveEffectiveLocationCommercial(
      { marginPercent: 20 },
      { defaultMarginPercent: 12 },
      DEFAULT_PLATFORM_CONFIG
    );
    expect(override.marginPercent).toBe(20);
    expect(override.usesOrgDefaultMargin).toBe(false);
  });
});
