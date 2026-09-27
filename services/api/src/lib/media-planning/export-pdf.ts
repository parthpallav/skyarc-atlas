import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatInventoryType, formatLighting } from "@skyarc/shared";
import type { ParsedCampaignBrief } from "../ai/campaign-brief-parse.js";

export interface MediaPlanPdfLineItem {
  rank: number | null;
  productCode: string;
  inventoryType: string;
  locationName: string;
  road: string | null;
  size?: string | null;
  lighting?: string | null;
  creativeBrief?: string | null;
  clientRate: number | null;
  budgetAllocated: number;
  coverImageUrl?: string | null;
  coverImageBuffer?: Buffer | null;
}

export interface MediaPlanPdfInput {
  advertiserName: string;
  campaignName: string;
  planName: string;
  /** Customer-facing label only, e.g. "Media plan proposal" */
  planLabel?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  generatedAt: Date;
  totalBudget: number | null;
  brief?: ParsedCampaignBrief | null;
  items: MediaPlanPdfLineItem[];
  assumptions?: string[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COLORS = {
  purple: "#7C3AED",
  purpleSoft: "#F5F3FF",
  ink: "#0F172A",
  muted: "#64748B",
  line: "#E2E8F0",
  white: "#FFFFFF",
  emerald: "#059669",
};

function fontCandidates(file: string): string[] {
  const bundled = path.resolve(__dirname, "../../../assets/fonts", file);
  return [
    bundled,
    path.resolve(process.cwd(), "assets/fonts", file),
    path.resolve(process.cwd(), "services/api/assets/fonts", file),
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
  ];
}

function resolveFont(file: string): string | null {
  for (const candidate of fontCandidates(file)) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Indian Rupee with en-IN grouping — requires Unicode font (Noto / Arial Unicode). */
export function formatInrPdf(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDateIn(d?: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function briefObjective(brief?: ParsedCampaignBrief | null): string {
  if (!brief?.objectives?.length) return "—";
  return brief.objectives.join("; ");
}

function briefGeography(brief?: ParsedCampaignBrief | null): string {
  if (!brief?.geographicFocus?.length) return "—";
  return brief.geographicFocus.join(", ");
}

async function fetchImageBuffer(url?: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("image") && !url.match(/\.(jpe?g|png|webp)(\?|$)/i)) {
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

function registerFonts(doc: PDFKit.PDFDocument): { regular: string; bold: string } {
  const regularPath = resolveFont("NotoSans-Regular.ttf");
  const boldPath = resolveFont("NotoSans-Bold.ttf") ?? regularPath;

  if (regularPath) {
    doc.registerFont("PlanSans", regularPath);
    doc.registerFont("PlanSans-Bold", boldPath ?? regularPath);
    return { regular: "PlanSans", bold: "PlanSans-Bold" };
  }

  // Last resort — Helvetica cannot render ₹ (shows as ¹ / boxes)
  return { regular: "Helvetica", bold: "Helvetica-Bold" };
}

function drawHeaderBar(doc: PDFKit.PDFDocument, title: string, fonts: { regular: string; bold: string }) {
  const top = 36;
  doc.rect(0, 0, doc.page.width, 56).fill(COLORS.purple);
  doc
    .fillColor(COLORS.white)
    .font(fonts.bold)
    .fontSize(14)
    .text("SKYARC ATLAS", 48, top, { continued: false });
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor("#E9D5FF")
    .text(title, 48, top + 18);
}

function drawFooter(doc: PDFKit.PDFDocument, pageNo: number, total: number, fonts: { regular: string }) {
  const y = doc.page.height - 36;
  doc
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .moveTo(48, y - 8)
    .lineTo(doc.page.width - 48, y - 8)
    .stroke();
  doc
    .font(fonts.regular)
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("Customer proposal · Prices in Indian Rupees (₹) · Excl. GST unless noted", 48, y, {
      width: 360,
    });
  doc.text(`${pageNo} / ${total}`, doc.page.width - 48 - 60, y, { width: 60, align: "right" });
}

export async function buildMediaPlanPdf(input: MediaPlanPdfInput): Promise<Buffer> {
  // Prefetch cover images in parallel
  const items = await Promise.all(
    input.items.map(async (item) => ({
      ...item,
      coverImageBuffer:
        item.coverImageBuffer ?? (await fetchImageBuffer(item.coverImageUrl ?? null)),
    }))
  );

  const totalPages = 1 + items.length; // cover + one per site
  const totalValue = items.reduce(
    (sum, item) => sum + (item.clientRate ?? item.budgetAllocated),
    0
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 48,
      size: "A4",
      autoFirstPage: true,
      info: {
        Title: input.planName,
        Author: "Skyarc Atlas",
        Subject: `Media plan for ${input.advertiserName}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fonts = registerFonts(doc);
    const moneyFont = fonts.regular; // Noto / Unicode — required for ₹

    // ── Cover ──────────────────────────────────────────────
    drawHeaderBar(doc, "Media plan proposal", fonts);

    let y = 80;
    doc
      .font(fonts.bold)
      .fontSize(22)
      .fillColor(COLORS.ink)
      .text(input.planName, 48, y, { width: 500 });
    y = doc.y + 8;

    doc
      .font(fonts.regular)
      .fontSize(11)
      .fillColor(COLORS.muted)
      .text("Prepared for", 48, y);
    y = doc.y + 2;
    doc
      .font(fonts.bold)
      .fontSize(14)
      .fillColor(COLORS.ink)
      .text(input.advertiserName, 48, y);
    y = doc.y + 16;

    // KPI cards
    const cardW = 155;
    const cardH = 58;
    const cards: Array<{ label: string; value: string }> = [
      {
        label: "Investment",
        value: formatInrPdf(totalValue),
      },
      {
        label: "Sites",
        value: String(items.length),
      },
      {
        label: "Flight",
        value:
          input.startDate || input.endDate
            ? `${formatDateIn(input.startDate)} – ${formatDateIn(input.endDate)}`
            : "Dates on request",
      },
    ];

    cards.forEach((card, i) => {
      const x = 48 + i * (cardW + 12);
      doc.roundedRect(x, y, cardW, cardH, 8).fill(COLORS.purpleSoft);
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor(COLORS.purple)
        .text(card.label.toUpperCase(), x + 12, y + 10, { width: cardW - 24 });
      doc
        .font(moneyFont)
        .fontSize(i === 2 ? 10 : 13)
        .fillColor(COLORS.ink)
        .text(card.value, x + 12, y + 26, { width: cardW - 24 });
    });
    y += cardH + 24;

    doc.font(fonts.bold).fontSize(12).fillColor(COLORS.ink).text("Campaign", 48, y);
    y = doc.y + 6;
    const overview: Array<[string, string]> = [
      ["Campaign", input.campaignName],
      ["Objective", briefObjective(input.brief)],
      ["Corridors / markets", briefGeography(input.brief)],
      [
        "Duration",
        input.brief?.durationDays ? `${input.brief.durationDays} days` : "—",
      ],
      ["Generated", formatDateIn(input.generatedAt)],
    ];
    if (input.totalBudget != null) {
      overview.splice(1, 0, ["Budget envelope", formatInrPdf(input.totalBudget)]);
    }

    for (const [label, value] of overview) {
      doc.font(fonts.regular).fontSize(9).fillColor(COLORS.muted).text(label, 48, y, { width: 130 });
      doc
        .font(label.toLowerCase().includes("budget") || label === "Investment" ? moneyFont : fonts.regular)
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(value, 180, y, { width: 360 });
      y = Math.max(doc.y, y) + 8;
    }

    y += 8;
    doc.font(fonts.bold).fontSize(12).fillColor(COLORS.ink).text("Site mix at a glance", 48, y);
    y = doc.y + 8;

    // Compact index table (customer facing only)
    doc.font(fonts.bold).fontSize(8).fillColor(COLORS.muted);
    doc.text("#", 48, y, { width: 24 });
    doc.text("Site", 72, y, { width: 200 });
    doc.text("Format", 280, y, { width: 120 });
    doc.text("Investment", 420, y, { width: 120, align: "right" });
    y += 14;
    doc
      .strokeColor(COLORS.line)
      .moveTo(48, y)
      .lineTo(547, y)
      .stroke();
    y += 6;

    for (const [idx, item] of items.entries()) {
      if (y > 700) break; // overflow stays on site pages
      const rate = item.clientRate ?? item.budgetAllocated;
      doc.font(fonts.regular).fontSize(9).fillColor(COLORS.ink);
      doc.text(String(item.rank ?? idx + 1), 48, y, { width: 24 });
      doc.text(`${item.productCode}  ·  ${item.locationName}`, 72, y, {
        width: 200,
        ellipsis: true,
      });
      doc.text(formatInventoryType(item.inventoryType), 280, y, {
        width: 120,
        ellipsis: true,
      });
      doc.font(moneyFont).text(formatInrPdf(rate), 420, y, { width: 120, align: "right" });
      y += 16;
    }

    y += 12;
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text("Each following page presents one site with photograph and customer details.", 48, y, {
        width: 500,
      });

    const assumptions =
      input.assumptions?.length
        ? input.assumptions
        : [
            "Rates shown are customer-facing list prices in Indian Rupees (₹).",
            "GST and production / mounting charges are extra unless agreed in writing.",
            "Availability is held for the stated flight and subject to final confirmation.",
          ];

    y = doc.y + 16;
    doc.font(fonts.bold).fontSize(11).fillColor(COLORS.ink).text("Notes", 48, y);
    y = doc.y + 6;
    doc.font(fonts.regular).fontSize(9).fillColor(COLORS.muted);
    for (const line of assumptions) {
      doc.text(`•  ${line}`, 48, doc.y, { width: 500, lineGap: 2 });
    }

    drawFooter(doc, 1, totalPages, fonts);

    // ── One page per site ─────────────────────────────────
    items.forEach((item, index) => {
      doc.addPage();
      drawHeaderBar(doc, `Site ${index + 1} of ${items.length}`, fonts);

      const pageY0 = 72;
      const imgW = 500;
      const imgH = 260;
      const imgX = 48;

      // Photo frame
      doc.roundedRect(imgX, pageY0, imgW, imgH, 10).fill("#F1F5F9");

      if (item.coverImageBuffer) {
        try {
          doc.image(item.coverImageBuffer, imgX, pageY0, {
            fit: [imgW, imgH],
            align: "center",
            valign: "center",
          });
          // subtle border
          doc
            .roundedRect(imgX, pageY0, imgW, imgH, 10)
            .lineWidth(0.75)
            .strokeColor(COLORS.line)
            .stroke();
        } catch {
          doc
            .font(fonts.regular)
            .fontSize(11)
            .fillColor(COLORS.muted)
            .text("Site photograph unavailable", imgX, pageY0 + imgH / 2 - 8, {
              width: imgW,
              align: "center",
            });
        }
      } else {
        doc
          .font(fonts.regular)
          .fontSize(11)
          .fillColor(COLORS.muted)
          .text("Site photograph unavailable", imgX, pageY0 + imgH / 2 - 8, {
            width: imgW,
            align: "center",
          });
      }

      let dy = pageY0 + imgH + 18;

      doc
        .font(fonts.regular)
        .fontSize(9)
        .fillColor(COLORS.purple)
        .text(item.productCode, 48, dy);
      dy = doc.y + 4;

      doc
        .font(fonts.bold)
        .fontSize(18)
        .fillColor(COLORS.ink)
        .text(item.locationName, 48, dy, { width: 500 });
      dy = doc.y + 6;

      if (item.road) {
        doc.font(fonts.regular).fontSize(10).fillColor(COLORS.muted).text(item.road, 48, dy);
        dy = doc.y + 14;
      } else {
        dy += 8;
      }

      const rate = item.clientRate ?? item.budgetAllocated;
      const detailCards: Array<{ label: string; value: string; money?: boolean }> = [
        { label: "Format", value: formatInventoryType(item.inventoryType) },
        { label: "Size", value: item.size ?? "—" },
        { label: "Lighting", value: formatLighting(item.lighting) ?? "—" },
        { label: "Investment", value: formatInrPdf(rate), money: true },
      ];

      const dCardW = 118;
      detailCards.forEach((card, i) => {
        const x = 48 + i * (dCardW + 10);
        doc.roundedRect(x, dy, dCardW, 52, 8).fill(COLORS.purpleSoft);
        doc
          .font(fonts.regular)
          .fontSize(7.5)
          .fillColor(COLORS.purple)
          .text(card.label.toUpperCase(), x + 10, dy + 8, { width: dCardW - 20 });
        doc
          .font(card.money ? moneyFont : fonts.bold)
          .fontSize(card.money ? 12 : 10)
          .fillColor(COLORS.ink)
          .text(card.value, x + 10, dy + 24, { width: dCardW - 20 });
      });

      dy += 68;

      doc.font(fonts.bold).fontSize(11).fillColor(COLORS.ink).text("Artwork guidance", 48, dy);
      dy = doc.y + 6;
      doc
        .font(fonts.regular)
        .fontSize(10)
        .fillColor(COLORS.muted)
        .text(
          item.creativeBrief?.trim() ||
            "Artwork specifications will be confirmed with Skyarc operations before production.",
          48,
          dy,
          { width: 500, lineGap: 3 }
        );

      drawFooter(doc, index + 2, totalPages, fonts);
    });

    doc.end();
  });
}
