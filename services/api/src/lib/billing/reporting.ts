/**
 * Campaign ops + commercial reporting aggregations.
 * Customer views must exclude internal costs and margins.
 */
import type { PrismaClient } from "@prisma/client";
import { computeCampaignReadiness } from "../ops/task-transitions.js";
import { proofCompletionSummary } from "../ops/proof.js";
import { outstandingMinor } from "./invoice.js";
import { campaignCommercialPerformance } from "./vendor-costs.js";

type Db = PrismaClient;

export async function campaignOpsReport(db: Db, campaignId: string) {
  const readiness = await computeCampaignReadiness(db, campaignId);
  const proof = await proofCompletionSummary(db, campaignId);
  const tasks = await db.executionTask.findMany({
    where: { campaignId, status: { in: ["BLOCKED", "READY", "IN_PROGRESS"] } },
    select: { id: true, title: true, status: true, dueAt: true, kind: true },
    orderBy: { dueAt: "asc" },
    take: 50,
  });
  return {
    readiness,
    proof,
    openIssues: tasks.filter((t) => t.status === "BLOCKED" || t.kind === "ISSUE_RESOLUTION"),
    overdueTasks: tasks.filter(
      (t) => t.dueAt && t.dueAt.getTime() < Date.now() && t.status !== "DONE"
    ),
  };
}

export async function campaignBillingReport(db: Db, campaignId: string, staff: boolean) {
  const invoices = await db.invoice.findMany({
    where: { campaignId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      currency: true,
      totalMinor: true,
      amountPaidMinor: true,
      amountCreditedMinor: true,
      dueAt: true,
    },
  });
  const aging = invoices
    .filter((i) => ["ISSUED", "PARTIALLY_PAID"].includes(i.status))
    .map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoiceNumber,
      outstandingMinor: outstandingMinor(i),
      dueAt: i.dueAt?.toISOString() ?? null,
      daysOverdue:
        i.dueAt && i.dueAt.getTime() < Date.now()
          ? Math.floor((Date.now() - i.dueAt.getTime()) / 86400000)
          : 0,
    }));

  const base = {
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      status: i.status,
      currency: i.currency,
      totalMinor: i.totalMinor,
      amountPaidMinor: i.amountPaidMinor,
      outstandingMinor: outstandingMinor(i),
      dueAt: i.dueAt?.toISOString() ?? null,
    })),
    aging,
  };

  if (!staff) return base;

  const commercial = await campaignCommercialPerformance(db, campaignId);
  const pos = await db.vendorPurchaseOrder.findMany({
    where: { campaignId },
    select: {
      id: true,
      poNumber: true,
      status: true,
      expectedCostMinor: true,
      approvedCommitmentMinor: true,
      vendorOrganizationId: true,
    },
  });
  return {
    ...base,
    vendorObligations: pos,
    commercialPerformance: commercial,
  };
}

export function customerProgressView(input: {
  readiness: Awaited<ReturnType<typeof computeCampaignReadiness>>;
  proof: Awaited<ReturnType<typeof proofCompletionSummary>>;
  approvedCreatives: number;
  invoices: Array<{
    invoiceNumber: string | null;
    status: string;
    totalMinor: number;
    amountPaidMinor: number;
    outstandingMinor: number;
  }>;
}) {
  return {
    executionProgress: {
      openTasks: input.readiness.openCount,
      doneTasks: input.readiness.doneCount,
      blockedTasks: input.readiness.blockedCount,
      overdueTasks: input.readiness.overdueCount,
      upcomingLaunches: input.readiness.upcomingLaunches,
    },
    proof: {
      approved: input.proof.approved,
      pending: input.proof.pending,
      missing: input.proof.missingFlag,
    },
    creativesApproved: input.approvedCreatives,
    billing: input.invoices.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      status: i.status,
      totalMinor: i.totalMinor,
      amountPaidMinor: i.amountPaidMinor,
      outstandingMinor: i.outstandingMinor,
    })),
    // Explicitly omit vendor costs / margins / mix targets
  };
}
