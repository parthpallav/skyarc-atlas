import { describe, expect, it } from "vitest";
import { buildMediaPlanWorkbook, buildShareSummaryText } from "../lib/excel-export.js";
import type { AtlasMediaPlan } from "../lib/atlas-client.js";

const samplePlan: AtlasMediaPlan = {
  id: "00000000-0000-4000-8000-000000000099",
  name: "Demo Plan",
  campaignId: "00000000-0000-4000-8000-000000000030",
  totalBudget: 500_000,
  mix: {
    sites: 2,
    allocated: 400_000,
    skyarcBudgetPercent: 75,
    premiumBudgetPercent: 50,
    minSkyarcBudgetMixPercent: 60,
    meetsSkyarcMixTarget: true,
  },
  items: [
    {
      rank: 1,
      budgetAllocated: 250_000,
      inventoryType: "DIGITAL_BILLBOARD",
      isPremium: true,
      location: { name: "Site A", skyarcSiteCode: "SKY-RAJ-001", road: "Kalawad Road" },
    },
    {
      rank: 2,
      budgetAllocated: 150_000,
      inventoryType: "STATIC_BILLBOARD",
      isPremium: false,
      location: { name: "Site B", skyarcSiteCode: "SKY-RAJ-002", road: "Yagnik Road" },
    },
  ],
};

describe("excel-export", () => {
  it("builds a non-empty xlsx buffer", async () => {
    const buffer = await buildMediaPlanWorkbook(samplePlan);
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it("builds share summary with plan link", () => {
    const text = buildShareSummaryText(samplePlan, "https://atlas.skyarcads.com");
    expect(text).toContain("Demo Plan");
    expect(text).toContain("Skyarc mix: 75%");
    expect(text).toContain("/campaigns/");
  });
});
