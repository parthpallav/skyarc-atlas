import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { parseInventoryExcel } from "../lib/excel-importer";

describe("Smart Excel Inventory Importer", () => {
  it("synthesizes and parses structured Excel inventory workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory");

    sheet.addRow(["Webpulse Media Inventory Availability - Rajkot"]);
    sheet.addRow([]);
    sheet.addRow([
      "Sr No",
      "IID",
      "Media Type",
      "Area / Corridor",
      "Location Description",
      "Size (W x H)",
      "Total Sqft",
      "Illumination",
      "Card Rate (INR)",
      "Discounted Rate",
      "Latitude",
      "Longitude",
    ]);

    sheet.addRow([
      1,
      "G-0029",
      "GANTRY",
      "Kalawad Road",
      "Near AG Chowk Flyover, Kalawad Road Facing",
      "22 x 5",
      110,
      "Backlit LED",
      150000,
      120000,
      22.2738,
      70.7573,
    ]);

    sheet.addRow([
      2,
      "G-1507",
      "UNIPOLE",
      "150 Feet Ring Road",
      "Mavdi Circle Junction, Towards Astron",
      "20 x 20",
      400,
      "Frontlit",
      180000,
      145000,
      22.291,
      70.785,
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const result = await parseInventoryExcel(buffer as ArrayBuffer);

    expect(result.errors).toEqual([]);
    expect(result.vendorOrgName).toContain("Webpulse");
    expect(result.items.length).toBe(2);

    const first = result.items[0];
    expect(first?.iid).toBe("G-0029");
    expect(first?.mediaType).toBe("GANTRY");
    expect(first?.widthFt).toBe(22);
    expect(first?.heightFt).toBe(5);
    expect(first?.sqft).toBe(110);
    expect(first?.lightingType).toBe("backlit");
    expect(first?.cardRateAmount).toBe(150000);
    expect(first?.latitude).toBeCloseTo(22.2738, 3);
    expect(first?.longitude).toBeCloseTo(70.7573, 3);

    const second = result.items[1];
    expect(second?.iid).toBe("G-1507");
    expect(second?.mediaType).toBe("UNIPOLE");
    expect(second?.sqft).toBe(400);
    expect(second?.cardRateAmount).toBe(180000);
  });

  // Optional regression tests when running on local workstation with sample downloads
  const localWebpulse = "/Users/rudra-pc/Downloads/Webpulse inventory_availability_2_19Aug2026.xlsx";
  const localVeda = "/Users/rudra-pc/Downloads/Media Availability - 21st August 2026.xlsx";

  if (existsSync(localWebpulse)) {
    it("parses local Webpulse availability excel file if present", async () => {
      const fileBuffer = readFileSync(localWebpulse).buffer;
      const result = await parseInventoryExcel(fileBuffer);
      expect(result.errors).toEqual([]);
      expect(result.items.length).toBeGreaterThan(50);
    });
  }

  if (existsSync(localVeda)) {
    it("parses local Veda / Media Availability excel file if present", async () => {
      const fileBuffer = readFileSync(localVeda).buffer;
      const result = await parseInventoryExcel(fileBuffer);
      expect(result.errors).toEqual([]);
      expect(result.items.length).toBeGreaterThan(50);
    });
  }
});
