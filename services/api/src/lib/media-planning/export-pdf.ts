import PDFDocument from "pdfkit";
import { formatInventoryType } from "@skyarc/shared";
import type { ParsedCampaignBrief } from "../ai/campaign-brief-parse.js";

export interface MediaPlanPdfLineItem {
  rank: number | null;
  productCode: string;
  inventoryType: string;
  locationName: string;
  road: string | null;
  screenLabel?: string | null;
  clientRate: number | null;
  budgetAllocated: number;
  explanationText?: string | null;
}

export interface MediaPlanPdfInput {
  advertiserName: string;
  campaignName: string;
  planName: string;
  planStatus: string;
  planUpdatedAt: Date;
  generatedAt: Date;
  totalBudget: number | null;
  brief?: ParsedCampaignBrief | null;
  items: MediaPlanPdfLineItem[];
  assumptions: string[];
}

function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function briefObjective(brief?: ParsedCampaignBrief | null): string {
  if (!brief?.objectives?.length) return "—";
  return brief.objectives.join("; ");
}

function briefDuration(brief?: ParsedCampaignBrief | null): string {
  if (!brief?.durationDays) return "—";
  return `${brief.durationDays} days`;
}

function briefGeography(brief?: ParsedCampaignBrief | null): string {
  if (!brief?.geographicFocus?.length) return "—";
  return brief.geographicFocus.join(", ");
}

export function buildMediaPlanPdf(input: MediaPlanPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const purple = "#9333EA";

    doc.fillColor(purple).fontSize(20).font("Helvetica-Bold").text("Skyarc Atlas", { align: "left" });
    doc.fillColor("#1A1A1A").fontSize(11).font("Helvetica").text("Media plan proposal", { align: "left" });
    doc.moveDown(0.5);
    doc.strokeColor("#E9D5FF").lineWidth(1).moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#1A1A1A").text("Campaign overview");
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10);
    const metaRows: Array<[string, string]> = [
      ["Advertiser", input.advertiserName],
      ["Campaign", input.campaignName],
      ["Plan", input.planName],
      ["Status", input.planStatus],
      ["Objective", briefObjective(input.brief)],
      ["Duration", briefDuration(input.brief)],
      ["Geography", briefGeography(input.brief)],
      ["Plan version", input.planUpdatedAt.toISOString().slice(0, 10)],
      ["Generated", input.generatedAt.toISOString().slice(0, 10)],
    ];
    for (const [label, value] of metaRows) {
      doc.fillColor("#6B7280").text(`${label}: `, { continued: true });
      doc.fillColor("#1A1A1A").text(value);
    }
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Recommended inventory");
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const colX = [48, 68, 150, 250, 310, 400, 480];
    const headers = ["#", "Product", "Location", "Road", "Type", "Client rate", "Budget"];

    doc.font("Helvetica-Bold").fontSize(9).fillColor("#374151");
    headers.forEach((header, i) => doc.text(header, colX[i], tableTop, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70 }));
    doc.moveDown(0.3);
    doc.strokeColor("#E5E7EB").moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown(0.3);

    let rowY = doc.y;
    doc.font("Helvetica").fontSize(8.5).fillColor("#1A1A1A");

    for (const item of input.items) {
      if (rowY > 720) {
        doc.addPage();
        rowY = 48;
      }

      const cells = [
        item.rank != null ? String(item.rank) : "—",
        item.productCode,
        item.locationName,
        item.road ?? "—",
        formatInventoryType(item.inventoryType),
        item.clientRate != null ? formatInr(item.clientRate) : "—",
        formatInr(item.budgetAllocated),
      ];

      cells.forEach((cell, i) => {
        doc.text(cell, colX[i], rowY, {
          width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70,
          lineGap: 1,
        });
      });

      rowY += 28;
      doc.y = rowY;
    }

    doc.moveDown(1);
    const totalClient = input.items.reduce(
      (sum, item) => sum + (item.clientRate ?? item.budgetAllocated),
      0
    );
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1A1A1A");
    doc.text(`Total customer-facing value: ${formatInr(totalClient)}`);
    if (input.totalBudget != null) {
      doc.font("Helvetica").fontSize(10).fillColor("#374151");
      doc.text(`Plan budget cap: ${formatInr(input.totalBudget)}`);
    }

    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(11).text("Assumptions");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9).fillColor("#374151");
    for (const assumption of input.assumptions) {
      doc.text(`• ${assumption}`, { lineGap: 2 });
    }

    doc.moveDown(1);
    doc.fontSize(8).fillColor("#9CA3AF").text(
      "Customer-facing rates exclude taxes and production unless noted. Availability subject to confirmation.",
      { align: "center" }
    );

    doc.end();
  });
}
