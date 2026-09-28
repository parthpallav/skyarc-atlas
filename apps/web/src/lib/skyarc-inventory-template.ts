import ExcelJS from "exceljs";

/** Canonical Skyarc minimal inventory import columns (header row). */
export const SKYARC_INVENTORY_TEMPLATE_HEADERS = [
  "Site Name",
  "Vendor Media Code",
  "Media Type",
  "Area",
  "Location",
  "Latitude",
  "Longitude",
  "Width (ft)",
  "Height (ft)",
  "SQFT",
  "Lighting",
  "Card Rate",
  "Discounted Rate",
  "City",
  "District",
  "State",
  "Premium (Y/N)",
] as const;

export const SKYARC_TEMPLATE_TITLE = "Skyarc Atlas Inventory Template";

export const SKYARC_TEMPLATE_UNSUPPORTED_MESSAGE =
  "This sheet doesn’t match a supported layout. Download our Skyarc template, fill in your inventory locations, and upload it again.";

export const SKYARC_TEMPLATE_EXPECTED_COLUMNS =
  "Expected columns: Site Name, Vendor Media Code, Media Type, Area, Location, Latitude, Longitude, Width (ft), Height (ft), SQFT, Lighting, Card Rate, Discounted Rate, City, District, State, Premium (Y/N).";

export type InventoryExcelFormat = "skyarc_template" | "vendor_legacy" | "unsupported";

/** Detect sheet format from title + header cell strings (lowercased). */
export function detectInventoryExcelFormat(opts: {
  titleCell?: string;
  headerCells: string[];
}): InventoryExcelFormat {
  const title = (opts.titleCell ?? "").toLowerCase().trim();
  if (title.includes("skyarc atlas inventory template") || title.includes("skyarc inventory template")) {
    return "skyarc_template";
  }

  const headers = opts.headerCells.map((h) => h.toLowerCase().trim()).filter(Boolean);
  const has = (label: string) => headers.some((h) => h === label || h.includes(label));

  const looksSkyarc =
    has("site name") &&
    (has("vendor media code") || has("premium")) &&
    (has("media type") || has("card rate") || has("latitude"));

  if (looksSkyarc) return "skyarc_template";

  const looksLegacy =
    has("media type") ||
    has("sqft") ||
    has("card rate") ||
    headers.some((h) => h === "iid") ||
    has("inventory id");

  if (looksLegacy) return "vendor_legacy";
  return "unsupported";
}

export function parsePremiumFlag(raw?: string | null): boolean | undefined {
  if (raw == null) return undefined;
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (["y", "yes", "true", "1", "premium"].includes(v)) return true;
  if (["n", "no", "false", "0"].includes(v)) return false;
  return undefined;
}

/** Build a downloadable Skyarc inventory .xlsx (title + headers + one sample row). */
export async function buildSkyarcInventoryTemplateBuffer(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Skyarc Atlas";
  const sheet = workbook.addWorksheet("Inventory");

  sheet.addRow([SKYARC_TEMPLATE_TITLE]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([
    "Fill one row per site. Latitude/Longitude recommended. Premium = Y marks sites for the PREMIUM PDF badge.",
  ]);
  sheet.addRow([]);
  sheet.addRow([...SKYARC_INVENTORY_TEMPLATE_HEADERS]);
  sheet.getRow(4).font = { bold: true };

  sheet.addRow([
    "Kalawad Road Gantry — Sample",
    "G-0029",
    "GANTRY",
    "Kalawad Road",
    "Near AG Chowk Flyover, facing west",
    22.2738,
    70.7573,
    22,
    5,
    110,
    "Backlit",
    150000,
    120000,
    "Rajkot",
    "Rajkot",
    "Gujarat",
    "Y",
  ]);

  // Set widths only — do not assign sheet.columns.header (that rewrites row 1).
  SKYARC_INVENTORY_TEMPLATE_HEADERS.forEach((header, idx) => {
    const col = sheet.getColumn(idx + 1);
    col.width = Math.min(28, Math.max(12, header.length + 2));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function downloadSkyarcInventoryTemplate(): Promise<void> {
  return buildSkyarcInventoryTemplateBuffer().then((buffer) => {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Skyarc-Atlas-Inventory-Template.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}
