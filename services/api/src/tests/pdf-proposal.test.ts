import { describe, expect, it } from "vitest";
import {
  artworkGuidanceForType,
  averageIndex,
  mapFactorBarsForPdf,
  proposalBadgeForIndex,
  resolveProposalRates,
} from "../lib/media-planning/pdf-proposal.js";

describe("proposalBadgeForIndex", () => {
  it("bands Must Buy / Strong Buy / Recommended / Consider", () => {
    expect(proposalBadgeForIndex(90)).toEqual({ label: "Must Buy", premium: true });
    expect(proposalBadgeForIndex(80)).toEqual({ label: "Strong Buy", premium: false });
    expect(proposalBadgeForIndex(60)).toEqual({ label: "Recommended", premium: false });
    expect(proposalBadgeForIndex(40)).toEqual({ label: "Consider", premium: false });
    expect(proposalBadgeForIndex(null)).toBeNull();
  });
});

describe("mapFactorBarsForPdf", () => {
  it("remaps Atlas attr keys to sample labels", () => {
    const bars = mapFactorBarsForPdf({
      visibility: 90,
      audience_fit: 70,
      approach_exposure: 80,
      brand_suitability: 99,
      location_quality: 75,
    });
    expect(bars.map((b) => b.label)).toEqual([
      "Visibility",
      "Reach",
      "Awareness",
      "Recall",
      "Traffic",
    ]);
    expect(bars[0].score).toBe(90);
    expect(bars[3].score).toBe(99);
  });
});

describe("averageIndex", () => {
  it("rounds mean of finite scores", () => {
    expect(averageIndex([90, 80, null, 70])).toBe(80);
    expect(averageIndex([])).toBeNull();
  });
});

describe("artworkGuidanceForType", () => {
  it("returns digital dual-screen guidance", () => {
    const text = artworkGuidanceForType("DIGITAL_BILLBOARD", { dualScreen: true });
    expect(text).toContain("1920 px");
    expect(text).toContain("H.264");
  });

  it("falls back for unknown static", () => {
    const text = artworkGuidanceForType("STATIC_HOARDING", { widthFt: 40, heightFt: 20 });
    expect(text).toContain("CMYK");
    expect(text).toContain("40 Ft X 20 Ft");
  });
});

describe("resolveProposalRates", () => {
  it("strikes when list exceeds plan", () => {
    expect(resolveProposalRates({ listRate: 200_000, planRate: 180_000 })).toEqual({
      listRate: 200_000,
      planRate: 180_000,
      showStrike: true,
    });
  });

  it("hides strike when equal", () => {
    expect(resolveProposalRates({ listRate: 75_000, planRate: 75_000 }).showStrike).toBe(false);
  });
});
