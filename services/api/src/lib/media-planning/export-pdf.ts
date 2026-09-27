import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { formatInventoryType, formatLighting, isDigitalInventoryType } from "@skyarc/shared";
import type { ParsedCampaignBrief } from "../ai/campaign-brief-parse.js";
import {
  artworkGuidanceForType,
  averageIndex,
  formatProposalDateLong,
  formatProposalTimestamp,
  mapFactorBarsForPdf,
  proposalBadgeForIndex,
  resolveProposalRates,
} from "./pdf-proposal.js";

export interface MediaPlanPdfLineItem {
  rank: number | null;
  productCode: string;
  inventoryType: string;
  locationName: string;
  road: string | null;
  size?: string | null;
  sizeLines?: string[] | null;
  lighting?: string | null;
  dualScreen?: boolean;
  creativeBrief?: string | null;
  artworkGuidance?: string | null;
  /** @deprecated use listRate / planRate */
  clientRate?: number | null;
  listRate?: number | null;
  planRate?: number | null;
  budgetAllocated: number;
  coverImageUrl?: string | null;
  coverImageBuffer?: Buffer | null;
  photoUrls?: string[] | null;
  photoBuffers?: Array<Buffer | null> | null;
  skyarcIndex?: number | null;
  factorScores?: Record<string, number> | null;
  whyThisSite?: string | null;
  demandLine?: string | null;
}

export interface MediaPlanPdfInput {
  advertiserName: string;
  campaignName: string;
  planName: string;
  planLabel?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  generatedAt: Date;
  totalBudget: number | null;
  city?: string | null;
  brief?: ParsedCampaignBrief | null;
  items: MediaPlanPdfLineItem[];
  assumptions?: string[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Match Canva sample page size (pts). */
const PAGE_SIZE: [number, number] = [810, 1012.5];
const MARGIN_X = 48;

const COLORS = {
  purple: "#7C3AED",
  purpleSoft: "#F5F3FF",
  purpleMuted: "#EDE9FE",
  ink: "#0F172A",
  muted: "#64748B",
  line: "#E2E8F0",
  white: "#FFFFFF",
  card: "#F1F5F9",
  emerald: "#22C55E",
  emeraldTrack: "#E2E8F0",
  strike: "#DC2626",
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

function resolveLogoPath(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../../assets/brand/skyarc-logo-dark.png"),
    path.resolve(process.cwd(), "services/api/assets/brand/skyarc-logo-dark.png"),
    path.resolve(process.cwd(), "assets/brand/skyarc-logo-dark.png"),
    path.resolve(process.cwd(), "apps/web/public/brand/skyarc-logo-dark.png"),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
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

function formatInrPlain(amount: number): string {
  return Math.round(Number(amount) || 0).toLocaleString("en-IN");
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

function briefCity(brief?: ParsedCampaignBrief | null, fallback?: string | null): string {
  if (fallback?.trim()) return fallback.trim();
  const geo = brief?.geographicFocus?.[0];
  return geo?.trim() || "—";
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

  return { regular: "Helvetica", bold: "Helvetica-Bold" };
}

type Fonts = { regular: string; bold: string };

function campaignDisplayName(input: MediaPlanPdfInput): string {
  return `${input.advertiserName}_${input.campaignName}`.replace(/\s+/g, " ").trim();
}

function drawPurpleHeader(
  doc: PDFKit.PDFDocument,
  fonts: Fonts,
  rightTitle: string,
  timestamp: string
) {
  const w = doc.page.width;
  doc.rect(0, 0, w, 64).fill(COLORS.purple);
  doc.fillColor(COLORS.white).font(fonts.bold).fontSize(13).text("SKYARC ATLAS", MARGIN_X, 16, {
    width: 280,
  });
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor("#E9D5FF")
    .text("Media plan proposal", MARGIN_X, 34, { width: 280 });
  doc
    .font(fonts.bold)
    .fontSize(10)
    .fillColor(COLORS.white)
    .text(rightTitle, w / 2, 16, { width: w / 2 - MARGIN_X, align: "right" });
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor("#E9D5FF")
    .text(timestamp, w / 2, 34, { width: w / 2 - MARGIN_X, align: "right" });
}

function drawCover(doc: PDFKit.PDFDocument, fonts: Fonts, input: MediaPlanPdfInput, stamp: string) {
  const w = doc.page.width;
  const h = doc.page.height;
  doc.rect(0, 0, w, 28).fill(COLORS.purple);

  const logo = resolveLogoPath();
  const centerY = h * 0.32;
  if (logo) {
    try {
      doc.image(logo, w / 2 - 90, centerY - 36, { width: 180, height: 54, fit: [180, 54] });
    } catch {
      doc
        .font(fonts.bold)
        .fontSize(28)
        .fillColor(COLORS.ink)
        .text("SKYARC", 0, centerY - 20, { width: w, align: "center" });
    }
  } else {
    doc
      .font(fonts.bold)
      .fontSize(28)
      .fillColor(COLORS.ink)
      .text("SKYARC", 0, centerY - 20, { width: w, align: "center" });
  }

  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor(COLORS.purple)
    .text("FIND YOUR SPOTLIGHT.", 0, centerY + 28, { width: w, align: "center" });

  doc
    .font(fonts.regular)
    .fontSize(16)
    .fillColor(COLORS.ink)
    .text("Media Plan Proposal", 0, centerY + 70, { width: w, align: "center" });

  doc
    .font(fonts.bold)
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text(campaignDisplayName(input), MARGIN_X, centerY + 110, {
      width: w - MARGIN_X * 2,
      align: "center",
    });

  doc
    .font(fonts.regular)
    .fontSize(11)
    .fillColor(COLORS.muted)
    .text(stamp, 0, centerY + 160, { width: w, align: "center" });
}

function roundedCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = COLORS.card
) {
  doc.roundedRect(x, y, w, h, 10).fill(fill);
}

function drawSummary(
  doc: PDFKit.PDFDocument,
  fonts: Fonts,
  input: MediaPlanPdfInput,
  items: Array<MediaPlanPdfLineItem & { photoBuffers: Array<Buffer | null> }>,
  stamp: string
) {
  const display = campaignDisplayName(input);
  drawPurpleHeader(doc, fonts, display, stamp);

  let y = 88;
  const contentW = doc.page.width - MARGIN_X * 2;

  doc.font(fonts.regular).fontSize(10).fillColor(COLORS.muted).text("Prepared for", MARGIN_X, y);
  y = doc.y + 4;
  doc.font(fonts.bold).fontSize(20).fillColor(COLORS.ink).text(display, MARGIN_X, y, {
    width: contentW,
  });
  y = doc.y + 14;

  const avg = averageIndex(items.map((i) => i.skyarcIndex));
  doc.font(fonts.regular).fontSize(14).fillColor(COLORS.ink);
  if (avg != null) {
    doc.text("Max Impactful Media plan with ", MARGIN_X, y, { continued: true });
    doc.fillColor(COLORS.purple).font(fonts.bold).text(`${avg}%`, { continued: true });
    doc.fillColor(COLORS.ink).font(fonts.regular).text(" effective reach");
  } else {
    doc.text("Max Impactful Media plan", MARGIN_X, y);
  }
  y = doc.y + 18;

  const investment = items.reduce((sum, item) => {
    const rates = resolveProposalRates({
      listRate: item.listRate ?? item.clientRate,
      planRate: item.planRate ?? item.budgetAllocated,
      fallback: item.clientRate ?? item.budgetAllocated,
    });
    return sum + rates.planRate;
  }, 0);

  const cardGap = 14;
  const cardW = (contentW - cardGap * 2) / 3;
  const cardH = 72;
  const cards: Array<{ label: string; value: string; money?: boolean }> = [
    { label: "INVESTMENT", value: formatInrPdf(investment), money: true },
    { label: "SITES", value: String(items.length) },
    {
      label: "On AIR",
      value:
        input.startDate || input.endDate
          ? `${formatDateIn(input.startDate)} – ${formatDateIn(input.endDate)}`
          : "Dates on request",
    },
  ];
  cards.forEach((card, i) => {
    const x = MARGIN_X + i * (cardW + cardGap);
    roundedCard(doc, x, y, cardW, cardH);
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(COLORS.purple)
      .text(card.label, x + 14, y + 14, { width: cardW - 28 });
    doc
      .font(card.money ? fonts.regular : fonts.bold)
      .fontSize(card.label === "On AIR" ? 11 : 16)
      .fillColor(COLORS.ink)
      .text(card.value, x + 14, y + 34, { width: cardW - 28 });
  });
  y += cardH + 20;

  const durationDays =
    input.brief?.durationDays ??
    (input.startDate && input.endDate
      ? Math.max(
          1,
          Math.round(
            (input.endDate.getTime() - input.startDate.getTime()) / (1000 * 60 * 60 * 24)
          ) + 1
        )
      : null);

  const details: Array<[string, string]> = [
    ["Campaign", input.campaignName],
    ["City", briefCity(input.brief, input.city)],
    ["Budget", input.totalBudget != null ? formatInrPdf(input.totalBudget) : "—"],
    ["Objective", briefObjective(input.brief)],
    ["Locations / Corridors", briefGeography(input.brief)],
    ["Duration", durationDays != null ? `${durationDays} days` : "—"],
    [
      "Generated on",
      `${formatProposalDateLong(input.generatedAt)} | ${stamp.split(" | ")[1] ?? ""}`.trim(),
    ],
  ];

  const boxH = 28 + details.length * 22;
  roundedCard(doc, MARGIN_X, y, contentW, boxH);
  let dy = y + 14;
  doc.font(fonts.bold).fontSize(11).fillColor(COLORS.ink).text("Campaign", MARGIN_X + 16, dy);
  dy += 20;
  for (const [label, value] of details) {
    doc.font(fonts.regular).fontSize(9).fillColor(COLORS.muted).text(label, MARGIN_X + 16, dy, {
      width: 150,
    });
    doc
      .font(fonts.regular)
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(value, MARGIN_X + 170, dy, { width: contentW - 200 });
    dy += 22;
  }
  y = y + boxH + 22;

  doc.font(fonts.bold).fontSize(12).fillColor(COLORS.ink).text("Site mix at a glance", MARGIN_X, y);
  y = doc.y + 10;

  doc.font(fonts.bold).fontSize(8).fillColor(COLORS.muted);
  doc.text("#", MARGIN_X, y, { width: 28 });
  doc.text("Site", MARGIN_X + 28, y, { width: 300 });
  doc.text("Format", MARGIN_X + 340, y, { width: 160 });
  doc.text("Investment", MARGIN_X + contentW - 110, y, { width: 110, align: "right" });
  y += 12;
  doc
    .strokeColor(COLORS.line)
    .lineWidth(0.75)
    .moveTo(MARGIN_X, y)
    .lineTo(MARGIN_X + contentW, y)
    .stroke();
  y += 8;

  for (const [idx, item] of items.entries()) {
    if (y > doc.page.height - 160) break;
    const rates = resolveProposalRates({
      listRate: item.listRate ?? item.clientRate,
      planRate: item.planRate ?? item.budgetAllocated,
      fallback: item.clientRate ?? item.budgetAllocated,
    });
    const siteLabel = `${item.productCode} · ${item.locationName}${
      item.road ? ` — ${item.road}` : ""
    }`;
    doc.font(fonts.regular).fontSize(9).fillColor(COLORS.ink);
    doc.text(String(item.rank ?? idx + 1), MARGIN_X, y, { width: 28 });
    doc.text(siteLabel, MARGIN_X + 28, y, { width: 300, ellipsis: true });
    doc.text(formatInventoryType(item.inventoryType), MARGIN_X + 340, y, {
      width: 160,
      ellipsis: true,
    });
    doc.text(formatInrPdf(rates.planRate), MARGIN_X + contentW - 110, y, {
      width: 110,
      align: "right",
    });
    y += 18;
  }

  y += 6;
  doc
    .strokeColor(COLORS.line)
    .moveTo(MARGIN_X, y)
    .lineTo(MARGIN_X + contentW, y)
    .stroke();
  y += 10;
  doc.font(fonts.bold).fontSize(11).fillColor(COLORS.ink).text("Total Payable Amount", MARGIN_X, y);
  doc
    .font(fonts.bold)
    .fontSize(14)
    .text(formatInrPdf(investment), MARGIN_X + contentW - 140, y, {
      width: 140,
      align: "right",
    });
  y = doc.y + 4;
  doc
    .font(fonts.regular)
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("Invoice amount will include 18% of GST", MARGIN_X + contentW - 220, y, {
      width: 220,
      align: "right",
    });

  y = Math.max(y + 28, doc.page.height - 140);
  doc.font(fonts.bold).fontSize(11).fillColor(COLORS.ink).text("Notes", MARGIN_X, y);
  y = doc.y + 6;
  const notes =
    input.assumptions?.length
      ? input.assumptions
      : [
          "All prices are customer-facing list rates in Indian Rupees (₹).",
          "GST, printing, mounting and power are extra unless stated in the commercial agreement.",
        ];
  doc.font(fonts.regular).fontSize(9).fillColor(COLORS.muted);
  for (const line of notes) {
    doc.text(`•  ${line}`, MARGIN_X, doc.y, { width: contentW, lineGap: 2 });
  }
}

function drawSitePage(
  doc: PDFKit.PDFDocument,
  fonts: Fonts,
  input: MediaPlanPdfInput,
  item: MediaPlanPdfLineItem & { photoBuffers: Array<Buffer | null> },
  stamp: string
) {
  const display = campaignDisplayName(input);
  drawPurpleHeader(doc, fonts, display, stamp);

  let y = 84;
  const contentW = doc.page.width - MARGIN_X * 2;
  const photos = (item.photoBuffers ?? []).filter((b): b is Buffer => Boolean(b));
  const photoCount = Math.max(1, Math.min(3, photos.length || 1));
  const gap = 10;
  const photoH = 200;
  const photoW = (contentW - gap * (photoCount - 1)) / photoCount;

  for (let i = 0; i < photoCount; i++) {
    const x = MARGIN_X + i * (photoW + gap);
    roundedCard(doc, x, y, photoW, photoH, COLORS.card);
    const buf = photos[i];
    if (buf) {
      try {
        doc.image(buf, x, y, { fit: [photoW, photoH], align: "center", valign: "center" });
        doc.roundedRect(x, y, photoW, photoH, 10).lineWidth(0.5).strokeColor(COLORS.line).stroke();
      } catch {
        /* leave grey card */
      }
    } else if (i === 0) {
      doc
        .font(fonts.regular)
        .fontSize(10)
        .fillColor(COLORS.muted)
        .text("Site photograph unavailable", x, y + photoH / 2 - 6, {
          width: photoW,
          align: "center",
        });
    }
  }

  const badge = proposalBadgeForIndex(item.skyarcIndex);
  if (badge?.premium) {
    doc.save();
    doc.translate(MARGIN_X + 28, y + photoH - 28);
    doc.rotate(-12);
    doc.roundedRect(-6, -10, 78, 22, 4).fill(COLORS.purple);
    doc.font(fonts.bold).fontSize(9).fillColor(COLORS.white).text("PREMIUM", 4, -4);
    doc.restore();
  }

  y += photoH + 18;

  doc.font(fonts.regular).fontSize(10).fillColor(COLORS.purple).text(item.productCode, MARGIN_X, y);
  y = doc.y + 4;
  const title = item.road
    ? `${item.locationName}${item.locationName.includes(item.road) ? "" : ` — ${item.road}`}`
    : item.locationName;
  doc.font(fonts.bold).fontSize(16).fillColor(COLORS.ink).text(title, MARGIN_X, y, {
    width: contentW,
  });
  y = doc.y + 14;

  const rates = resolveProposalRates({
    listRate: item.listRate ?? item.clientRate,
    planRate: item.planRate ?? item.budgetAllocated,
    fallback: item.clientRate ?? item.budgetAllocated,
  });
  const digital = isDigitalInventoryType(item.inventoryType);
  const dual =
    item.dualScreen === true ||
    (digital && (item.sizeLines?.length ?? 0) >= 2);
  const mediaLabel = formatInventoryType(item.inventoryType);
  const sizeLines =
    item.sizeLines?.length
      ? item.sizeLines
      : item.size
        ? [item.size]
        : ["—"];

  const specW = (contentW - gap * 3) / 4;
  const specH = 78;
  const specs: Array<{ label: string; draw: (x: number, top: number) => void }> = [
    {
      label: "Media Type",
      draw: (x, top) => {
        doc.font(fonts.bold).fontSize(10).fillColor(COLORS.ink).text(mediaLabel, x + 10, top + 28, {
          width: specW - 20,
        });
        if (dual) {
          doc
            .roundedRect(x + 10, top + 48, 72, 16, 8)
            .fill(COLORS.purpleMuted);
          doc
            .font(fonts.regular)
            .fontSize(8)
            .fillColor(COLORS.purple)
            .text("Dual Screen", x + 16, top + 51);
        }
      },
    },
    {
      label: "Size",
      draw: (x, top) => {
        let ty = top + 28;
        for (const line of sizeLines.slice(0, 2)) {
          doc.roundedRect(x + 8, ty - 2, specW - 16, 16, 4).fill(COLORS.purpleMuted);
          doc
            .font(fonts.regular)
            .fontSize(9)
            .fillColor(COLORS.ink)
            .text(line, x + 12, ty, { width: specW - 24 });
          ty += 20;
        }
      },
    },
    {
      label: "Lighting",
      draw: (x, top) => {
        doc
          .font(fonts.bold)
          .fontSize(11)
          .fillColor(COLORS.ink)
          .text(formatLighting(item.lighting) ?? "—", x + 10, top + 32, {
            width: specW - 20,
          });
      },
    },
    {
      label: "Investment",
      draw: (x, top) => {
        if (rates.showStrike && rates.listRate != null) {
          const struck = formatInrPlain(rates.listRate);
          doc
            .font(fonts.regular)
            .fontSize(10)
            .fillColor(COLORS.strike)
            .text(struck, x + 10, top + 26, { width: (specW - 20) / 2 });
          // strike line
          const tw = doc.widthOfString(struck);
          doc
            .strokeColor(COLORS.strike)
            .lineWidth(1)
            .moveTo(x + 10, top + 32)
            .lineTo(x + 10 + tw, top + 32)
            .stroke();
          doc
            .font(fonts.bold)
            .fontSize(12)
            .fillColor(COLORS.ink)
            .text(formatInrPlain(rates.planRate), x + 10 + (specW - 20) / 2, top + 24, {
              width: (specW - 20) / 2,
            });
          doc
            .font(fonts.regular)
            .fontSize(7)
            .fillColor(COLORS.muted)
            .text("Actual", x + 10, top + 44, { width: (specW - 20) / 2 });
          doc.text("Discounted", x + 10 + (specW - 20) / 2, top + 44, {
            width: (specW - 20) / 2,
          });
        } else {
          doc
            .font(fonts.bold)
            .fontSize(13)
            .fillColor(COLORS.ink)
            .text(formatInrPdf(rates.planRate), x + 10, top + 32, { width: specW - 20 });
        }
      },
    },
  ];

  specs.forEach((spec, i) => {
    const x = MARGIN_X + i * (specW + gap);
    roundedCard(doc, x, y, specW, specH);
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(COLORS.purple)
      .text(spec.label, x + 10, y + 10, { width: specW - 20 });
    spec.draw(x, y);
  });
  y += specH + 22;

  const bars = mapFactorBarsForPdf(item.factorScores);
  const barAreaW = contentW * 0.62;
  const rankingX = MARGIN_X + barAreaW + 24;
  let by = y;
  for (const bar of bars) {
    doc.font(fonts.regular).fontSize(9).fillColor(COLORS.ink).text(bar.label, MARGIN_X, by, {
      width: 80,
    });
    const trackX = MARGIN_X + 88;
    const trackW = barAreaW - 130;
    doc.roundedRect(trackX, by + 3, trackW, 8, 4).fill(COLORS.emeraldTrack);
    const fillW = Math.max(2, (trackW * bar.score) / 100);
    doc.roundedRect(trackX, by + 3, fillW, 8, 4).fill(COLORS.emerald);
    doc
      .font(fonts.bold)
      .fontSize(9)
      .fillColor(COLORS.ink)
      .text(`${bar.score}%`, trackX + trackW + 8, by, { width: 40 });
    by += 22;
  }

  if (item.skyarcIndex != null && Number.isFinite(item.skyarcIndex)) {
    const overall = Math.round(item.skyarcIndex);
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text("Overall Ranking", rankingX, y, { width: 140, align: "center" });
    doc
      .font(fonts.bold)
      .fontSize(36)
      .fillColor(COLORS.purple)
      .text(`${overall}%`, rankingX, y + 18, { width: 140, align: "center" });
    if (badge) {
      doc
        .font(fonts.bold)
        .fontSize(12)
        .fillColor(COLORS.ink)
        .text(badge.label, rankingX, y + 66, { width: 140, align: "center" });
      if (badge.premium) {
        doc
          .font(fonts.regular)
          .fontSize(14)
          .fillColor(COLORS.emerald)
          .text("✓", rankingX + 100, y + 64);
      }
    }
  }

  y = Math.max(by, y + 100) + 16;

  const artwork =
    item.artworkGuidance?.trim() ||
    artworkGuidanceForType(item.inventoryType, {
      dualScreen: dual,
      widthFt: null,
      heightFt: null,
    });

  const artH = 70;
  roundedCard(doc, MARGIN_X, y, contentW, artH);
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text("Artwork guidance", MARGIN_X + 14, y + 12);
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(artwork, MARGIN_X + 14, y + 30, { width: contentW - 28, lineGap: 2 });
}

export async function buildMediaPlanPdf(input: MediaPlanPdfInput): Promise<Buffer> {
  const items = await Promise.all(
    input.items.map(async (item) => {
      const urls =
        item.photoUrls?.filter(Boolean).slice(0, 3) ??
        (item.coverImageUrl ? [item.coverImageUrl] : []);
      let photoBuffers = item.photoBuffers ?? null;
      if (!photoBuffers?.length) {
        if (item.coverImageBuffer) {
          photoBuffers = [item.coverImageBuffer];
        } else {
          photoBuffers = await Promise.all(urls.map((u) => fetchImageBuffer(u)));
        }
      }
      return { ...item, photoBuffers: photoBuffers ?? [] };
    })
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: PAGE_SIZE,
      margin: 0,
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
    const stamp = formatProposalTimestamp(input.generatedAt);

    drawCover(doc, fonts, input, stamp);

    doc.addPage({ size: PAGE_SIZE, margin: 0 });
    drawSummary(doc, fonts, input, items, stamp);

    for (const item of items) {
      doc.addPage({ size: PAGE_SIZE, margin: 0 });
      drawSitePage(doc, fonts, input, item, stamp);
    }

    doc.end();
  });
}
