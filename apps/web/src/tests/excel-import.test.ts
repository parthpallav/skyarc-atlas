import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseInventoryExcel } from "../lib/excel-importer";

describe("Smart Excel Inventory Importer (Real files)", () => {
  it("parses Webpulse availability excel sheet accurately", async () => {
    const filePath = "/Users/rudra-pc/Downloads/Webpulse inventory_availability_2_19Aug2026.xlsx";
    const fileBuffer = readFileSync(filePath).buffer;

    const result = await parseInventoryExcel(fileBuffer);
    expect(result.errors).toEqual([]);
    expect(result.vendorOrgName).toContain("Webpulse");
    expect(result.items.length).toBeGreaterThan(50);

    const first = result.items[0];
    expect(first).toBeDefined();
    expect(first?.iid).toBe("G-0029");
    expect(first?.mediaType).toBe("GANTRY");
    expect(first?.widthFt).toBe(22);
    expect(first?.heightFt).toBe(5);
    expect(first?.sqft).toBe(110);
    expect(first?.lightingType).toBe("backlit");
    expect(first?.cardRateAmount).toBe(150000);
    expect(first?.latitude).toBeGreaterThan(20);
    expect(first?.longitude).toBeGreaterThan(69);
  });

  it("parses Veda / Media Availability excel sheet with Lat/Long and Discounted rates accurately", async () => {
    const filePath = "/Users/rudra-pc/Downloads/Media Availability - 21st August 2026.xlsx";
    const fileBuffer = readFileSync(filePath).buffer;

    const result = await parseInventoryExcel(fileBuffer);
    expect(result.errors).toEqual([]);
    expect(result.vendorOrgName).toContain("VEDA");
    expect(result.items.length).toBeGreaterThan(50);

    const first = result.items[0];
    expect(first).toBeDefined();
    expect(first?.iid).toBe("G-1507");
    expect(first?.latitude).toBeCloseTo(22.291, 2);
    expect(first?.longitude).toBeCloseTo(70.785, 2);
    expect(first?.sqft).toBe(400);
    expect(first?.cardRateAmount).toBe(330000);
    expect(first?.discountedRateAmount).toBe(231000);
  });
});
