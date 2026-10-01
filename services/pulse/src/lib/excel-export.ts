import ExcelJS from "exceljs";
import type { AtlasMediaPlan } from "./atlas-client.js";

export async function buildMediaPlanWorkbook(plan: AtlasMediaPlan): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Skyarc Atlas Pulse";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 48 },
  ];
  const mix = plan.mix ?? {};
  summary.addRows([
    { field: "Plan name", value: plan.name },
    { field: "Plan ID", value: plan.id },
    { field: "Campaign ID", value: plan.campaignId },
    { field: "Total budget (INR)", value: plan.totalBudget ?? "" },
    { field: "Allocated (INR)", value: mix.allocated ?? "" },
    { field: "Sites", value: mix.sites ?? plan.items.length },
    { field: "Skyarc mix %", value: mix.skyarcBudgetPercent ?? "" },
    { field: "Premium mix %", value: mix.premiumBudgetPercent ?? "" },
    { field: "Meets Skyarc mix target", value: mix.meetsSkyarcMixTarget ?? "" },
  ]);

  const sites = workbook.addWorksheet("Sites");
  sites.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Skyarc site code", key: "code", width: 18 },
    { header: "Site name", key: "name", width: 36 },
    { header: "Road / corridor", key: "road", width: 24 },
    { header: "Format", key: "format", width: 22 },
    { header: "Premium", key: "premium", width: 10 },
    { header: "Client rate (INR)", key: "rate", width: 16 },
  ];

  for (const item of plan.items) {
    const rate =
      item.budgetAllocated > 0
        ? item.budgetAllocated
        : item.pricing?.clientRate ?? 0;
    sites.addRow({
      rank: item.rank ?? "",
      code: item.location?.skyarcSiteCode ?? "",
      name: item.location?.name ?? "",
      road: item.location?.road ?? "",
      format: item.inventoryType ?? "",
      premium: item.isPremium ? "Y" : "N",
      rate,
    });
  }

  sites.getRow(1).font = { bold: true };
  summary.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildShareSummaryText(plan: AtlasMediaPlan, webAppUrl: string): string {
  const mix = plan.mix ?? {};
  const budget = plan.totalBudget != null ? `₹${plan.totalBudget.toLocaleString("en-IN")}` : "—";
  const allocated =
    mix.allocated != null ? `₹${Number(mix.allocated).toLocaleString("en-IN")}` : "—";
  const skyarc =
    mix.skyarcBudgetPercent != null ? `${mix.skyarcBudgetPercent}%` : "—";
  const lines = [
    `Skyarc Atlas — ${plan.name}`,
    `Sites: ${plan.items.length} · Budget ${budget} · Allocated ${allocated}`,
    `Skyarc mix: ${skyarc} (target ≥${mix.minSkyarcBudgetMixPercent ?? 60}%)`,
    `View plan: ${webAppUrl.replace(/\/$/, "")}/campaigns/${plan.campaignId}/plans/${plan.id}`,
  ];
  return lines.join("\n");
}
