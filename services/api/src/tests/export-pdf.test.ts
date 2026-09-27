import { describe, expect, it } from "vitest";
import { buildMediaPlanPdf, formatInrPdf } from "../lib/media-planning/export-pdf.js";

describe("formatInrPdf", () => {
  it("uses Indian Rupee sign and en-IN grouping", () => {
    expect(formatInrPdf(1_50_000)).toBe("₹1,50,000");
    expect(formatInrPdf(2500)).toBe("₹2,500");
  });
});

describe("buildMediaPlanPdf", () => {
  it("builds a multi-page customer PDF with Unicode font (₹-capable)", async () => {
    const jpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
      "base64"
    );

    const buf = await buildMediaPlanPdf({
      advertiserName: "Acme Brands",
      campaignName: "Ring Road Takeover",
      planName: "Prime Ring Road & Arterial Unipole Takeover",
      startDate: new Date("2026-04-01"),
      endDate: new Date("2026-04-30"),
      generatedAt: new Date("2026-03-15"),
      totalBudget: 1_50_000,
      items: [
        {
          rank: 1,
          productCode: "SK-RJ-001",
          inventoryType: "STATIC_HOARDING",
          locationName: "Kalawad Road Junction",
          road: "Kalawad Road",
          size: "40×20 ft",
          lighting: "FRONT_LIT",
          creativeBrief: "Landscape 40×20 ft · Front-lit",
          clientRate: 75_000,
          budgetAllocated: 75_000,
          coverImageBuffer: jpeg,
        },
        {
          rank: 2,
          productCode: "SK-RJ-002",
          inventoryType: "UNIPOLE",
          locationName: "Ring Road Unipole",
          road: "150 Feet Ring Road",
          size: "20×10 ft",
          lighting: "BACK_LIT",
          creativeBrief: null,
          clientRate: 75_000,
          budgetAllocated: 75_000,
          coverImageBuffer: jpeg,
        },
      ],
    });

    expect(buf.subarray(0, 5).toString("utf8")).toBe("%PDF-");
    const asLatin = buf.toString("latin1");
    // Noto Sans is registered so ₹ renders (Helvetica cannot)
    expect(asLatin).toMatch(/NotoSans|PlanSans/);
    expect(asLatin).toContain("Prime Ring Road");
    expect(asLatin).toContain("Skyarc Atlas");
    expect(asLatin).not.toMatch(/\bDRAFT\b|\bPENDING\b|vendorRate|impliedMargin/i);
    // Cover + 2 site pages
    const pageCount = (asLatin.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBeGreaterThanOrEqual(3);
  });
});
