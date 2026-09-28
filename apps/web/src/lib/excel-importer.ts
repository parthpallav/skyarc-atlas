import ExcelJS from "exceljs";
import { getMarketCity } from "@skyarc/shared";
import {
  detectInventoryExcelFormat,
  parsePremiumFlag,
  SKYARC_TEMPLATE_EXPECTED_COLUMNS,
  SKYARC_TEMPLATE_UNSUPPORTED_MESSAGE,
  type InventoryExcelFormat,
} from "./skyarc-inventory-template";

export interface ParsedInventoryItem {
  name: string;
  skyarcSiteCode?: string;
  vendorMediaCode?: string;
  /** @deprecated backward compat */
  iid?: string;
  latitude: number;
  longitude: number;
  city?: string;
  district?: string;
  state?: string;
  area?: string;
  locationDescription?: string;
  mediaType: string;
  widthFt?: number;
  heightFt?: number;
  sqft?: number;
  lightingType?: string;
  availableFrom?: string;
  cardRateAmount?: number;
  discountedRateAmount?: number;
  ratePeriod: string;
  /** When set from Skyarc template Premium column — stored on location skyarcCommercialJson.premium */
  premium?: boolean;
}

export interface ExcelParseResult {
  vendorOrgName?: string;
  items: ParsedInventoryItem[];
  errors: string[];
  format: InventoryExcelFormat;
}

// Landmark fallbacks for common Gujarat corridors (seed / import datasets)
const AREA_LANDMARK_COORDS: Record<string, { lat: number; lng: number }> = {
  "150ft ring road": { lat: 22.285, lng: 70.768 },
  "150 feet ring road": { lat: 22.285, lng: 70.768 },
  "80 feet road": { lat: 22.2808, lng: 70.8062 },
  "80ft road": { lat: 22.2808, lng: 70.8062 },
  "amin marg": { lat: 22.291, lng: 70.7855 },
  "astron chowk": { lat: 22.296, lng: 70.792 },
  "astron under bridge": { lat: 22.296, lng: 70.792 },
  "gsrtc, bus port": { lat: 22.308, lng: 70.802 },
  gsrtc: { lat: 22.308, lng: 70.802 },
  "bus port": { lat: 22.308, lng: 70.802 },
  busport: { lat: 22.308, lng: 70.802 },
  bedi: { lat: 22.342, lng: 70.812 },
  "kalawad road": { lat: 22.274, lng: 70.758 },
  "nana mauva road": { lat: 22.2835, lng: 70.7895 },
  "nana mauva": { lat: 22.2835, lng: 70.7895 },
  "raiya road": { lat: 22.2985, lng: 70.7853 },
  "yagnik road": { lat: 22.295, lng: 70.795 },
  "race course": { lat: 22.301, lng: 70.798 },
  "mavdi circle": { lat: 22.261, lng: 70.7874 },
  mavdi: { lat: 22.261, lng: 70.7874 },
  "gondal road": { lat: 22.271, lng: 70.804 },
  "gondal circle": { lat: 22.2516, lng: 70.7901 },
  "madhapar circle": { lat: 22.3314, lng: 70.7657 },
  madhapar: { lat: 22.3314, lng: 70.7657 },
  kothariya: { lat: 22.245, lng: 70.825 },
  "university road": { lat: 22.292, lng: 70.765 },
};

function normalizeMediaType(typeStr?: string | null): string {
  if (!typeStr) return "STATIC_BILLBOARD";
  const t = typeStr.toLowerCase().trim();
  if (t.includes("gantry")) return "GANTRY";
  if (t.includes("unipole")) return "UNIPOLE";
  if (t.includes("digital") || t.includes("led") || t.includes("screen") || t.includes("dooh"))
    return "DIGITAL_BILLBOARD";
  if (t.includes("kiosk") || t.includes("totem")) return "KIOSK";
  if (t.includes("bus") || t.includes("bqs") || t.includes("shelter")) return "BUS_SHELTER";
  if (t.includes("mall") || t.includes("atrium")) return "MALL_MEDIA";
  if (t.includes("hoarding") || t.includes("static") || t.includes("billboard"))
    return "STATIC_BILLBOARD";
  return "STATIC_BILLBOARD";
}

function normalizeLighting(lightStr?: string | null): string | undefined {
  if (!lightStr) return undefined;
  const l = lightStr.toUpperCase().trim();
  if (l === "BL" || l.includes("BACK")) return "backlit";
  if (l === "FL" || l.includes("FRONT")) return "frontlit";
  if (l === "NL" || l.includes("NON") || l.includes("NO")) return "non_lit";
  return lightStr;
}

function extractCellValue(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "string") return cell.trim();
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  if (cell instanceof Date) return cell.toISOString();
  if (typeof cell === "object") {
    const obj = cell as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((t: { text?: string }) => t?.text || "").join("").trim();
    }
    if (obj.text != null) return String(obj.text).trim();
    if (obj.result != null) return String(obj.result).trim();
  }
  return String(cell).trim();
}

function parseNumber(val: unknown): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  const str = extractCellValue(val);
  if (!str) return undefined;
  const cleaned = str.replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? undefined : num;
}

function parseDimensions(sizeStr: string): { width?: number; height?: number } {
  const parts = sizeStr.toLowerCase().split(/[x*×]/);
  if (parts.length === 2) {
    const w = parseNumber(parts[0]);
    const h = parseNumber(parts[1]);
    if (w && h) return { width: w, height: h };
  }
  return {};
}

function mapHeaderColumns(row: unknown[]): Record<string, number> {
  const colIndexMap: Record<string, number> = {};
  row.forEach((colName, cIdx) => {
    const norm = extractCellValue(colName).toLowerCase();
    if (norm === "sr" || norm === "sr." || norm === "s.no" || norm === "sr no") colIndexMap.sr = cIdx;
    else if (norm === "site name" || norm === "name" || norm === "site") colIndexMap.siteName = cIdx;
    else if (norm === "media type" || norm === "type" || norm === "media") colIndexMap.mediaType = cIdx;
    else if (
      norm === "iid" ||
      norm === "inventory id" ||
      norm === "id" ||
      norm === "site id" ||
      norm === "media code" ||
      norm === "vendor code" ||
      norm === "vendor media code" ||
      norm === "hoarding no"
    )
      colIndexMap.vendorMediaCode = cIdx;
    else if (norm === "district") colIndexMap.district = cIdx;
    else if (norm === "city") colIndexMap.city = cIdx;
    else if (norm === "state") colIndexMap.state = cIdx;
    else if (norm === "area" || norm === "area / corridor") colIndexMap.area = cIdx;
    else if (
      norm === "location" ||
      norm === "location description" ||
      norm === "site description" ||
      norm === "site location"
    )
      colIndexMap.location = cIdx;
    else if (norm === "lat" || norm === "latitude") colIndexMap.latitude = cIdx;
    else if (norm === "long" || norm === "longitude" || norm === "lng") colIndexMap.longitude = cIdx;
    else if (norm === "w" || norm === "width" || norm === "width (ft)" || norm === "w(ft)")
      colIndexMap.width = cIdx;
    else if (norm === "h" || norm === "height" || norm === "height (ft)" || norm === "h(ft)")
      colIndexMap.height = cIdx;
    else if (norm.startsWith("size") || norm.startsWith("dimension")) colIndexMap.size = cIdx;
    else if (norm === "sqft" || norm === "sq.ft" || norm === "total sqft" || norm === "area (sqft)")
      colIndexMap.sqft = cIdx;
    else if (norm === "light" || norm === "lighting" || norm === "illumination")
      colIndexMap.lighting = cIdx;
    else if (norm === "available from" || norm === "availability") colIndexMap.availableFrom = cIdx;
    else if (norm.includes("card rate")) colIndexMap.cardRate = cIdx;
    else if (norm.includes("discounted")) colIndexMap.discountedRate = cIdx;
    else if (norm.startsWith("premium")) colIndexMap.premium = cIdx;
  });
  return colIndexMap;
}

export async function parseInventoryExcel(fileBuffer: ArrayBuffer): Promise<ExcelParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return {
      items: [],
      errors: ["Excel file does not contain any sheets."],
      format: "unsupported",
    };
  }

  const rawData: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    const cleanValues = Array.isArray(values) ? values.slice(1) : [];
    rawData.push(cleanValues);
  });

  if (rawData.length === 0) {
    return { items: [], errors: ["Sheet is empty."], format: "unsupported" };
  }

  let vendorOrgName: string | undefined;
  for (let r = 0; r < Math.min(6, rawData.length); r++) {
    const row = rawData[r] || [];
    const firstCell = extractCellValue(row[0]);
    if (
      firstCell &&
      !firstCell.toLowerCase().startsWith("date") &&
      !firstCell.toLowerCase().startsWith("project") &&
      !firstCell.toLowerCase().startsWith("available") &&
      !firstCell.toLowerCase().startsWith("to,") &&
      !firstCell.toLowerCase().startsWith("sr") &&
      !firstCell.toLowerCase().includes("skyarc atlas inventory") &&
      !firstCell.toLowerCase().startsWith("fill one row") &&
      firstCell.length > 3
    ) {
      vendorOrgName = firstCell;
      break;
    }
  }

  let headerRowIndex = -1;
  let colIndexMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(25, rawData.length); r++) {
    const row = rawData[r] || [];
    const rowStr = row.map((cell) => extractCellValue(cell).toLowerCase());

    if (
      rowStr.some(
        (c) =>
          c === "media type" ||
          c === "sqft" ||
          c === "card rate" ||
          c.includes("card rate") ||
          c === "iid" ||
          c === "site name" ||
          c === "vendor media code" ||
          c.startsWith("premium")
      )
    ) {
      headerRowIndex = r;
      colIndexMap = mapHeaderColumns(row);
      break;
    }
  }

  const titleCell = extractCellValue(rawData[0]?.[0]);
  const headerCells =
    headerRowIndex >= 0
      ? (rawData[headerRowIndex] || []).map((c) => extractCellValue(c))
      : [];
  const format = detectInventoryExcelFormat({ titleCell, headerCells });

  if (format === "unsupported" || headerRowIndex === -1) {
    return {
      items: [],
      errors: [SKYARC_TEMPLATE_UNSUPPORTED_MESSAGE, SKYARC_TEMPLATE_EXPECTED_COLUMNS],
      format: "unsupported",
    };
  }

  const items: ParsedInventoryItem[] = [];
  const errors: string[] = [];

  for (let r = headerRowIndex + 1; r < rawData.length; r++) {
    const row = rawData[r] || [];
    if (!row.some((cell) => cell != null && extractCellValue(cell) !== "")) continue;

    const rawCode =
      colIndexMap.vendorMediaCode != null
        ? extractCellValue(row[colIndexMap.vendorMediaCode])
        : undefined;
    const vendorMediaCode = rawCode || undefined;
    const mediaTypeRaw =
      colIndexMap.mediaType != null ? extractCellValue(row[colIndexMap.mediaType]) : undefined;
    const area = colIndexMap.area != null ? extractCellValue(row[colIndexMap.area]) : "";
    const locDesc = colIndexMap.location != null ? extractCellValue(row[colIndexMap.location]) : "";
    const explicitName =
      colIndexMap.siteName != null ? extractCellValue(row[colIndexMap.siteName]) : "";
    const defaultMarket = getMarketCity();
    const city =
      colIndexMap.city != null ? extractCellValue(row[colIndexMap.city]) : defaultMarket.name;
    const district =
      colIndexMap.district != null
        ? extractCellValue(row[colIndexMap.district])
        : defaultMarket.district;
    const state =
      colIndexMap.state != null ? extractCellValue(row[colIndexMap.state]) : defaultMarket.state;

    let lat = colIndexMap.latitude != null ? parseNumber(row[colIndexMap.latitude]) : undefined;
    let lng = colIndexMap.longitude != null ? parseNumber(row[colIndexMap.longitude]) : undefined;

    if (lat == null || lng == null) {
      const combinedText = `${area} ${locDesc}`.toLowerCase().trim();
      const match = Object.entries(AREA_LANDMARK_COORDS).find(([k]) => combinedText.includes(k));
      if (match) {
        const jitter = ((r % 10) - 5) * 0.0015;
        lat = match[1].lat + jitter;
        lng = match[1].lng + jitter;
      } else {
        const market = getMarketCity(city);
        lat = market.center.lat + ((r % 20) - 10) * 0.002;
        lng = market.center.lng + ((r % 20) - 10) * 0.002;
      }
    }

    let widthFt = colIndexMap.width != null ? parseNumber(row[colIndexMap.width]) : undefined;
    let heightFt = colIndexMap.height != null ? parseNumber(row[colIndexMap.height]) : undefined;

    if ((!widthFt || !heightFt) && colIndexMap.size != null) {
      const sizeStr = extractCellValue(row[colIndexMap.size]);
      const parsedDim = parseDimensions(sizeStr);
      widthFt = widthFt || parsedDim.width;
      heightFt = heightFt || parsedDim.height;
    }

    const sqft =
      colIndexMap.sqft != null
        ? parseNumber(row[colIndexMap.sqft])
        : widthFt && heightFt
          ? widthFt * heightFt
          : 200;
    const lightRaw =
      colIndexMap.lighting != null ? extractCellValue(row[colIndexMap.lighting]) : undefined;
    const availableFrom =
      colIndexMap.availableFrom != null
        ? extractCellValue(row[colIndexMap.availableFrom])
        : undefined;
    const cardRate =
      colIndexMap.cardRate != null ? parseNumber(row[colIndexMap.cardRate]) : undefined;
    const discountedRate =
      colIndexMap.discountedRate != null
        ? parseNumber(row[colIndexMap.discountedRate])
        : undefined;
    const premium =
      colIndexMap.premium != null
        ? parsePremiumFlag(extractCellValue(row[colIndexMap.premium]))
        : undefined;

    const siteName =
      explicitName ||
      (vendorMediaCode
        ? `${vendorMediaCode} - ${area || locDesc || "Billboard Site"}`
        : `${area || locDesc || `${city} Site`} #${r}`);

    items.push({
      name: siteName,
      vendorMediaCode,
      iid: vendorMediaCode,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      city,
      district,
      state,
      area,
      locationDescription: locDesc,
      mediaType: normalizeMediaType(mediaTypeRaw),
      widthFt,
      heightFt,
      sqft,
      lightingType: normalizeLighting(lightRaw),
      availableFrom: availableFrom || undefined,
      cardRateAmount: cardRate,
      discountedRateAmount: discountedRate,
      ratePeriod: "monthly",
      ...(premium != null ? { premium } : {}),
    });
  }

  if (items.length === 0) {
    errors.push("No inventory rows found under the header. Add at least one site row and try again.");
  }

  return {
    vendorOrgName: format === "skyarc_template" ? undefined : vendorOrgName,
    items,
    errors,
    format,
  };
}
