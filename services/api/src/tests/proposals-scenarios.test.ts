import { describe, expect, it } from "vitest";
import { buildProposalPptx, inspectPptxSlides } from "../lib/proposals/export-pptx.js";
import { buildProposalXlsx } from "../lib/proposals/export-xlsx.js";
import type { ProposalSnapshot } from "../lib/proposals/proposal.js";
import { customerSafeScenarioBundle, type ScenarioBundle } from "../lib/proposals/scenarios.js";
import { hashShareToken } from "../lib/proposals/proposal.js";

const sampleSnapshot: ProposalSnapshot = {
  campaignId: "c1",
  campaignName: "Demo Campaign",
  advertiserName: "Acme",
  scenarioKind: "COVERAGE",
  strategySummary: "Broader reach",
  tradeOffs: ["More sites"],
  evidenceLimitations: ["No Orbit telemetry"],
  flight: { start: "2026-11-01", end: "2026-11-14" },
  lines: [
    {
      inventoryId: "i1",
      locationId: "l1",
      locationName: "Site A",
      skyarcSiteCode: "SKY-001",
      inventoryType: "STATIC_BILLBOARD",
      road: "Ring Road",
      reason: "Broadens reach · score 88",
      listRate: 100000,
      flightCost: 50000,
      availabilityFreshness: "fresh",
      freeSlots: 1,
      slotCapacity: 1,
    },
  ],
  totalCost: 50000,
  currency: "INR",
  assumptions: {},
};

describe("proposal exports", () => {
  it("builds xlsx zip with workbook parts", () => {
    const buf = buildProposalXlsx(sampleSnapshot);
    expect(buf.length).toBeGreaterThan(100);
    const asText = buf.toString("binary");
    expect(asText).toContain("xl/workbook.xml");
    expect(asText).toContain("xl/worksheets/sheet1.xml");
  });

  it("builds pptx with three slides and no margin keywords", () => {
    const buf = buildProposalPptx(sampleSnapshot);
    const info = inspectPptxSlides(buf);
    expect(info.slideCount).toBe(3);
    expect(info.hasCampaignName).toBe(true);
    const text = buf.toString("utf8");
    expect(text.toLowerCase()).not.toContain("marginpercent");
    expect(text.toLowerCase()).not.toContain("vendorcost");
  });
});

describe("customer-safe scenarios", () => {
  it("strips raw score numbers from reasons", () => {
    const bundle: ScenarioBundle = {
      campaignId: "c",
      meaningfullyDifferent: true,
      limitation: null,
      evidenceLimitations: [],
      constraintsApplied: {
        geography: [],
        flight: { start: null, end: null },
        formats: [],
        capacityChecked: true,
      },
      coverage: {
        kind: "COVERAGE",
        label: "Coverage",
        strategySummary: "x",
        tradeOffs: [],
        lines: [
          {
            ...sampleSnapshot.lines[0]!,
            reason: "Broadens reach across Ring Road · score 92",
          },
        ],
        totalCost: 1,
        siteCount: 1,
        formatCount: 1,
        roadCount: 1,
      },
      concentration: null,
    };
    const safe = customerSafeScenarioBundle(bundle);
    expect(safe.coverage!.lines[0]!.reason).not.toMatch(/score\s+\d+/i);
  });
});

describe("share token hash", () => {
  it("is deterministic", () => {
    expect(hashShareToken("abc")).toBe(hashShareToken("abc"));
    expect(hashShareToken("abc")).not.toBe(hashShareToken("abcd"));
  });
});
