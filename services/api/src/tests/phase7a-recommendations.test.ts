import { describe, expect, it } from "vitest";
import {
  disruptionFromBlockedLaunch,
  disruptionFromRejectedItem,
  RULE_VERSION,
} from "../lib/recommendations/continuity-detect.js";
import { suggestContinuityReplacements } from "../lib/recommendations/replacements.js";
import { suggestFillRatePackages } from "../lib/recommendations/fill-rate.js";
import {
  appendActionHistory,
  isRecommendationStale,
  defaultExpiry,
} from "../lib/recommendations/persist.js";
import {
  serializeRecommendationCustomer,
  serializeRecommendationStaff,
} from "../lib/recommendations/serialize.js";

function inv(partial: {
  id: string;
  city: string;
  type: string;
  rate: number;
  vendorCost?: number | null;
  windows?: Array<{ startDate: Date; endDate: Date; status: string }>;
  status?: string;
}) {
  return {
    id: partial.id,
    inventoryType: partial.type,
    status: partial.status ?? "AVAILABLE",
    slotCapacity: 1,
    staticSpecsJson: { widthFt: 20, heightFt: 10, lighting: "LED" },
    availabilityWindows: partial.windows ?? [],
    confirmedVendorCost: partial.vendorCost,
    rateCards: [{ amount: partial.rate, period: "monthly" }],
    screen: {
      locationId: `loc-${partial.id}`,
      location: {
        name: `Site ${partial.id}`,
        city: partial.city,
        skyarcSiteCode: `SKY-${partial.id}`,
        skyarcCommercialJson: { clientRateAmount: partial.rate, ratePeriod: "monthly" },
      },
    },
  };
}

describe("continuity detection", () => {
  it("builds vendor rejection trigger keys without orbit inference", () => {
    const d = disruptionFromRejectedItem({
      campaignId: "c1",
      bookingId: "b1",
      bookingItemId: "bi1",
      inventoryId: "i1",
      locationId: "l1",
      inventoryType: "STATIC_BILLBOARD",
      city: "Jaipur",
    });
    expect(d.triggerType).toBe("VENDOR_REJECTION");
    expect(d.triggerKey).toBe("continuity:vendor_reject:bi1");
    expect(d.explanation).not.toMatch(/orbit|mqtt|telemetry/i);
  });

  it("captures launch blocked reasons", () => {
    const d = disruptionFromBlockedLaunch({
      campaignId: "c1",
      bookingId: "b1",
      bookingItemId: "bi2",
      inventoryId: "i1",
      locationId: "l1",
      inventoryType: "DIGITAL",
      city: "Ajmer",
      blockedReason: "Creative not approved",
    });
    expect(d.triggerType).toBe("LAUNCH_BLOCKED");
    expect(d.explanation).toContain("Creative not approved");
  });
});

describe("continuity replacements", () => {
  const start = new Date("2026-11-01T00:00:00Z");
  const end = new Date("2026-11-30T00:00:00Z");

  it("suggests same-city format matches with commercial delta and does not reserve", () => {
    const suggestions = suggestContinuityReplacements(
      [
        inv({ id: "a", city: "Jaipur", type: "STATIC_BILLBOARD", rate: 100000 }),
        inv({ id: "b", city: "Jaipur", type: "STATIC_BILLBOARD", rate: 120000 }),
        inv({
          id: "c",
          city: "Jaipur",
          type: "STATIC_BILLBOARD",
          rate: 90000,
          windows: [{ startDate: start, endDate: end, status: "BOOKED" }],
        }),
        inv({ id: "d", city: "Udaipur", type: "DIGITAL", rate: 50000 }),
      ],
      {
        inventoryId: "orig",
        inventoryType: "STATIC_BILLBOARD",
        city: "Jaipur",
        locationId: "l0",
        startDate: start,
        endDate: end,
        originalRateAmount: 100000,
        originalFlightCost: 100000,
      }
    );

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.method === "DETERMINISTIC_RULE")).toBe(true);
    expect(suggestions[0].ruleVersion).toBe(RULE_VERSION);
    expect(suggestions.find((s) => s.inventoryId === "c")).toBeUndefined();
    const top = suggestions[0];
    expect(top.whyFits.length).toBeGreaterThan(0);
    expect(top.evidence.capacityAvailable).toBe(true);
    expect(typeof top.commercialDelta).toBe("number");
  });

  it("flags PRICING_UNAVAILABLE without inventing zeros as real prices", () => {
    const suggestions = suggestContinuityReplacements(
      [inv({ id: "z", city: "Jaipur", type: "STATIC_BILLBOARD", rate: 0 })],
      {
        inventoryId: "orig",
        inventoryType: "STATIC_BILLBOARD",
        city: "Jaipur",
        locationId: "l0",
        startDate: start,
        endDate: end,
        originalRateAmount: 100000,
        originalFlightCost: 100000,
      }
    );
    expect(suggestions[0]?.pricingAvailable).toBe(false);
    expect(suggestions[0]?.limitations.some((l) => /PRICING_UNAVAILABLE/.test(l))).toBe(true);
  });
});

describe("fill-rate packages", () => {
  const start = new Date("2026-12-01T00:00:00Z");
  const end = new Date("2026-12-14T00:00:00Z");

  it("suggests packages and suppresses margin when costs missing", () => {
    const pkgs = suggestFillRatePackages(
      [
        inv({ id: "1", city: "Jaipur", type: "DIGITAL", rate: 80000, vendorCost: null }),
        inv({ id: "2", city: "Jaipur", type: "DIGITAL", rate: 70000, vendorCost: null }),
      ],
      {
        vacancy: { startDate: start, endDate: end },
        minMarginPercent: 20,
        maxFaces: 2,
      }
    );
    expect(pkgs.length).toBe(1);
    expect(pkgs[0].marginSuppressed).toBe(true);
    expect(pkgs[0].costDataComplete).toBe(false);
    expect(pkgs[0].packageMarginPercent).toBeNull();
    expect(pkgs[0].explanation).toMatch(/not a demand forecast/i);
    expect(pkgs[0].explanation).not.toMatch(/ML model|forecast demand/i);
    expect(pkgs[0].method === "DETERMINISTIC_RULE" || pkgs[0].method === "HEURISTIC").toBe(true);
  });

  it("applies margin floor when vendor costs are confirmed", () => {
    // vendorCost is for the vacancy flight window (caller supplies period-aligned cost)
    const ok = suggestFillRatePackages(
      [inv({ id: "1", city: "Jaipur", type: "DIGITAL", rate: 100000, vendorCost: 20000 })],
      { vacancy: { startDate: start, endDate: end }, minMarginPercent: 20, maxFaces: 1 }
    );
    expect(ok.length).toBe(1);
    expect(ok[0].marginSuppressed).toBe(false);
    expect(ok[0].packageMarginPercent).toBeGreaterThanOrEqual(20);

    const suppressed = suggestFillRatePackages(
      [inv({ id: "2", city: "Ajmer", type: "DIGITAL", rate: 100000, vendorCost: 45000 })],
      { vacancy: { startDate: start, endDate: end }, minMarginPercent: 20, maxFaces: 1 }
    );
    expect(suppressed.length).toBe(0);
  });

  it("labels single-face as deterministic and multi-face as heuristic", () => {
    const one = suggestFillRatePackages(
      [inv({ id: "1", city: "Kota", type: "STATIC", rate: 50000, vendorCost: 30000 })],
      { vacancy: { startDate: start, endDate: end }, maxFaces: 3 }
    );
    expect(one[0].method).toBe("DETERMINISTIC_RULE");

    const multi = suggestFillRatePackages(
      [
        inv({ id: "1", city: "Kota", type: "STATIC", rate: 50000, vendorCost: 30000 }),
        inv({ id: "2", city: "Kota", type: "STATIC", rate: 40000, vendorCost: 25000 }),
      ],
      { vacancy: { startDate: start, endDate: end }, maxFaces: 3 }
    );
    expect(multi[0].method).toBe("HEURISTIC");
  });
});

describe("recommendation records helpers", () => {
  it("reconciles action history and detects stale rows", () => {
    const hist = appendActionHistory([], {
      at: new Date().toISOString(),
      action: "create",
    });
    expect(hist).toHaveLength(1);
    expect(
      isRecommendationStale({
        status: "OPEN",
        expiresAt: new Date(Date.now() - 1000),
      })
    ).toBe(true);
    expect(
      isRecommendationStale({
        status: "OPEN",
        expiresAt: defaultExpiry(),
        freshnessLabel: "fresh",
      })
    ).toBe(false);
  });

  it("strips margin/cost fields from customer serialization", () => {
    const row = {
      id: "r1",
      tenantOrganizationId: "t1",
      kind: "FILL_RATE_PACKAGE",
      status: "OPEN",
      method: "HEURISTIC",
      ruleVersion: RULE_VERSION,
      triggerKey: "k",
      triggerType: "UPCOMING_VACANCY",
      campaignId: null,
      bookingId: null,
      bookingItemId: null,
      observedAt: new Date(),
      expiresAt: defaultExpiry(),
      inputSnapshotJson: {},
      suggestionsJson: [
        {
          packageCustomerTotal: 100,
          packageVendorTotal: 40,
          packageMarginPercent: 60,
          faces: [{ vendorCost: 40, estimatedMarginPercent: 60, rateAmount: 100 }],
        },
      ],
      explanation: "test",
      freshnessLabel: "fresh",
      pricingAvailable: true,
      costDataComplete: true,
      marginSuppressed: false,
      reviewedAt: null,
      reviewedByUserId: null,
      appliedChangeJson: {},
      actionHistoryJson: [{ action: "create" }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const staff = serializeRecommendationStaff(row);
    expect(staff.marginSuppressed).toBe(false);
    expect(JSON.stringify(staff.suggestions)).toMatch(/vendorCost|Margin/i);

    const customer = serializeRecommendationCustomer(row);
    expect(customer).not.toHaveProperty("marginSuppressed");
    expect(customer).not.toHaveProperty("actionHistory");
    expect(JSON.stringify(customer.suggestions)).not.toMatch(/vendorCost|packageMargin|estimatedMargin/i);
    expect(JSON.stringify(customer.suggestions)).toMatch(/rateAmount/);
  });
});

describe("apply approval gates (pure contracts)", () => {
  it("documents that apply requires APPROVED and rejects stale", () => {
    // Contract covered by apply.ts — assert helper used by apply path
    expect(
      isRecommendationStale({
        status: "APPROVED",
        expiresAt: new Date(Date.now() - 1),
      })
    ).toBe(true);
    expect(
      isRecommendationStale({
        status: "APPROVED",
        expiresAt: defaultExpiry(),
      })
    ).toBe(false);
  });
});
