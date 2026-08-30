import ExcelJS from "exceljs";

export interface ParsedInventoryItem {
  name: string;
  iid?: string;
  latitude: number;
  longitude: number;
  city?: string;
  district?: string;
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
}

export interface ExcelParseResult {
  vendorOrgName?: string;
  items: ParsedInventoryItem[];
  errors: string[];
}

// Calibrated Rajkot geographical landmarks & corridor centers
const RAJKOT_AREA_COORDS: Record<string, { lat: number; lng: number }> = {
  "150ft ring road": { lat: 22.2850, lng: 70.7680 },
  "150 feet ring road": { lat: 22.2850, lng: 70.7680 },
  "80 feet road": { lat: 22.2808, lng: 70.8062 },
  "80ft road": { lat: 22.2808, lng: 70.8062 },
  "amin marg": { lat: 22.2910, lng: 70.7855 },
  "astron chowk": { lat: 22.2960, lng: 70.7920 },
  "astron under bridge": { lat: 22.2960, lng: 70.7920 },
  "gsrtc, bus port": { lat: 22.3080, lng: 70.8020 },
  "gsrtc": { lat: 22.3080, lng: 70.8020 },
  "bus port": { lat: 22.3080, lng: 70.8020 },
  "busport": { lat: 22.3080, lng: 70.8020 },
  "bedi": { lat: 22.3420, lng: 70.8120 },
  "kalawad road": { lat: 22.2740, lng: 70.7580 },
  "nana mauva road": { lat: 22.2835, lng: 70.7895 },
  "nana mauva": { lat: 22.2835, lng: 70.7895 },
  "raiya road": { lat: 22.2985, lng: 70.7853 },
  "yagnik road": { lat: 22.2950, lng: 70.7950 },
  "race course": { lat: 22.3010, lng: 70.7980 },
  "mavdi circle": { lat: 22.2610, lng: 70.7874 },
  "mavdi": { lat: 22.2610, lng: 70.7874 },
  "gondal road": { lat: 22.2710, lng: 70.8040 },
  "gondal circle": { lat: 22.2516, lng: 70.7901 },
  "madhapar circle": { lat: 22.3314, lng: 70.7657 },
  "madhapar": { lat: 22.3314, lng: 70.7657 },
  "kothariya": { lat: 22.2450, lng: 70.8250 },
  "university road": { lat: 22.2920, lng: 70.7650 },
};

function normalizeMediaType(typeStr?: string | null): string {
  if (!typeStr) return "STATIC_BILLBOARD";
  const t = typeStr.toLowerCase().trim();
  if (t.includes("gantry")) return "GANTRY";
  if (t.includes("unipole")) return "UNIPOLE";
  if (t.includes("digital") || t.includes("led") || t.includes("screen") || t.includes("dooh")) return "DIGITAL_BILLBOARD";
  if (t.includes("kiosk") || t.includes("totem")) return "KIOSK";
  if (t.includes("bus") || t.includes("bqs") || t.includes("shelter")) return "BUS_SHELTER";
  if (t.includes("mall") || t.includes("atrium")) return "MALL_MEDIA";
  if (t.includes("hoarding") || t.includes("static") || t.includes("billboard")) return "STATIC_BILLBOARD";
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
  // Clean currency symbols and commas
  const cleaned = str.replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? undefined : num;
}

function parseDimensions(sizeStr: string): { width?: number; height?: number } {
  const parts = sizeStr.toLowerCase().split(/[x*]/);
  if (parts.length === 2) {
    const w = parseNumber(parts[0]);
    const h = parseNumber(parts[1]);
    if (w && h) return { width: w, height: h };
  }
  return {};
}

export async function parseInventoryExcel(fileBuffer: ArrayBuffer): Promise<ExcelParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { items: [], errors: ["Excel file does not contain any sheets."] };
  }

  const rawData: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    // exceljs row.values is 1-indexed, index 0 is undefined
    const cleanValues = Array.isArray(values) ? values.slice(1) : [];
    rawData.push(cleanValues);
  });

  if (rawData.length === 0) {
    return { items: [], errors: ["Sheet is empty."] };
  }

  let vendorOrgName: string | undefined;
  // Detect company name in header rows (usually rows 0-5)
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
      firstCell.length > 3
    ) {
      vendorOrgName = firstCell;
      break;
    }
  }

  // Find header row by matching signature column labels
  let headerRowIndex = -1;
  const colIndexMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(25, rawData.length); r++) {
    const row = rawData[r] || [];
    const rowStr = row.map((cell) => extractCellValue(cell).toLowerCase());

    if (
      rowStr.some((c) => c === "media type" || c === "sqft" || c === "card rate" || c.includes("card rate") || c === "iid")
    ) {
      headerRowIndex = r;
      row.forEach((colName, cIdx) => {
        const norm = extractCellValue(colName).toLowerCase();
        if (norm === "sr" || norm === "sr." || norm === "s.no" || norm === "sr no") colIndexMap.sr = cIdx;
        else if (norm === "media type" || norm === "type" || norm === "media") colIndexMap.mediaType = cIdx;
        else if (norm === "iid" || norm === "inventory id" || norm === "id" || norm === "site id") colIndexMap.iid = cIdx;
        else if (norm === "district") colIndexMap.district = cIdx;
        else if (norm === "city") colIndexMap.city = cIdx;
        else if (norm === "area") colIndexMap.area = cIdx;
        else if (norm === "location" || norm === "location description" || norm === "site description" || norm === "site location") colIndexMap.location = cIdx;
        else if (norm === "lat" || norm === "latitude") colIndexMap.latitude = cIdx;
        else if (norm === "long" || norm === "longitude" || norm === "lng") colIndexMap.longitude = cIdx;
        else if (norm === "w" || norm === "width" || norm === "width (ft)" || norm === "w(ft)") colIndexMap.width = cIdx;
        else if (norm === "h" || norm === "height" || norm === "height (ft)" || norm === "h(ft)") colIndexMap.height = cIdx;
        else if (norm.startsWith("size") || norm.startsWith("dimension")) colIndexMap.size = cIdx;
        else if (norm === "sqft" || norm === "sq.ft" || norm === "total sqft" || norm === "area (sqft)") colIndexMap.sqft = cIdx;
        else if (norm === "light" || norm === "lighting" || norm === "illumination") colIndexMap.lighting = cIdx;
        else if (norm === "available from" || norm === "availability") colIndexMap.availableFrom = cIdx;
        else if (norm.includes("card rate")) colIndexMap.cardRate = cIdx;
        else if (norm.includes("discounted")) colIndexMap.discountedRate = cIdx;
      });
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      items: [],
      errors: [
        "Could not detect valid inventory table headers (expected columns like 'Media Type', 'IID', 'Area', 'Location', 'SQFT', 'Card Rate').",
      ],
    };
  }

  const items: ParsedInventoryItem[] = [];
  const errors: string[] = [];

  for (let r = headerRowIndex + 1; r < rawData.length; r++) {
    const row = rawData[r] || [];
    if (!row.some((cell) => cell != null && extractCellValue(cell) !== "")) continue;

    const iid = colIndexMap.iid != null ? extractCellValue(row[colIndexMap.iid]) : undefined;
    const mediaTypeRaw = colIndexMap.mediaType != null ? extractCellValue(row[colIndexMap.mediaType]) : undefined;
    const area = colIndexMap.area != null ? extractCellValue(row[colIndexMap.area]) : "";
    const locDesc = colIndexMap.location != null ? extractCellValue(row[colIndexMap.location]) : "";
    const city = colIndexMap.city != null ? extractCellValue(row[colIndexMap.city]) : "Rajkot";
    const district = colIndexMap.district != null ? extractCellValue(row[colIndexMap.district]) : "Rajkot";

    // Latitude & Longitude
    let lat = colIndexMap.latitude != null ? parseNumber(row[colIndexMap.latitude]) : undefined;
    let lng = colIndexMap.longitude != null ? parseNumber(row[colIndexMap.longitude]) : undefined;

    // Fallback coordinates from Area/Location matching
    if (lat == null || lng == null) {
      const combinedText = `${area} ${locDesc}`.toLowerCase().trim();
      const match = Object.entries(RAJKOT_AREA_COORDS).find(([k]) => combinedText.includes(k));
      if (match) {
        const jitter = ((r % 10) - 5) * 0.0015;
        lat = match[1].lat + jitter;
        lng = match[1].lng + jitter;
      } else {
        lat = 22.3039 + ((r % 20) - 10) * 0.002;
        lng = 70.8022 + ((r % 20) - 10) * 0.002;
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

    const sqft = colIndexMap.sqft != null ? parseNumber(row[colIndexMap.sqft]) : (widthFt && heightFt ? widthFt * heightFt : 200);
    const lightRaw = colIndexMap.lighting != null ? extractCellValue(row[colIndexMap.lighting]) : undefined;
    const availableFrom = colIndexMap.availableFrom != null ? extractCellValue(row[colIndexMap.availableFrom]) : undefined;
    const cardRate = colIndexMap.cardRate != null ? parseNumber(row[colIndexMap.cardRate]) : undefined;
    const discountedRate = colIndexMap.discountedRate != null ? parseNumber(row[colIndexMap.discountedRate]) : undefined;

    const siteName = iid
      ? `${iid} - ${area || locDesc || "Billboard Site"}`
      : `${area || locDesc || "Rajkot Site"} #${r}`;

    items.push({
      name: siteName,
      iid: iid || undefined,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      city,
      district,
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
    });
  }

  return {
    vendorOrgName,
    items,
    errors,
  };
}
