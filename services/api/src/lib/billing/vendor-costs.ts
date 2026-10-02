/**
 * Vendor POs, bills, and campaign expenses.
 * Internal costs/margins restricted to staff serializers.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export async function createVendorPo(
  db: Db,
  input: {
    tenantOrganizationId?: string | null;
    campaignId?: string | null;
    vendorOrganizationId: string;
    expectedCostMinor: number;
    poNumber?: string;
    notes?: string;
    actorUserId?: string | null;
  }
) {
  const po = await db.vendorPurchaseOrder.create({
    data: {
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      campaignId: input.campaignId ?? null,
      vendorOrganizationId: input.vendorOrganizationId,
      expectedCostMinor: input.expectedCostMinor,
      approvedCommitmentMinor: 0,
      poNumber: input.poNumber ?? null,
      notes: input.notes ?? null,
      createdByUserId: input.actorUserId ?? null,
      status: "DRAFT",
    },
  });
  return { po };
}

export async function approveVendorPo(db: Db, poId: string, commitmentMinor: number) {
  const po = await db.vendorPurchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return { error: "PO not found" as const };
  if (po.status !== "DRAFT") return { error: `Cannot approve from ${po.status}` as const };
  const updated = await db.vendorPurchaseOrder.update({
    where: { id: poId },
    data: {
      status: "APPROVED",
      approvedCommitmentMinor: commitmentMinor,
      updatedAt: new Date(),
    },
  });
  return { po: updated };
}

export async function upsertCampaignExpense(
  db: Db,
  input: {
    tenantOrganizationId?: string | null;
    campaignId: string;
    attributionKey: string;
    label: string;
    expectedMinor?: number;
    committedMinor?: number;
    incurredMinor?: number;
    paidMinor?: number;
    costMissing?: boolean;
    purchaseOrderId?: string | null;
    vendorBillId?: string | null;
    status?: "EXPECTED" | "COMMITTED" | "INCURRED" | "PAID" | "VOID";
  }
) {
  try {
    const row = await db.campaignExpense.upsert({
      where: {
        campaignId_attributionKey: {
          campaignId: input.campaignId,
          attributionKey: input.attributionKey,
        },
      },
      create: {
        tenantOrganizationId: input.tenantOrganizationId ?? null,
        campaignId: input.campaignId,
        attributionKey: input.attributionKey,
        label: input.label,
        expectedMinor: input.expectedMinor ?? 0,
        committedMinor: input.committedMinor ?? 0,
        incurredMinor: input.incurredMinor ?? 0,
        paidMinor: input.paidMinor ?? 0,
        costMissing: input.costMissing ?? (input.expectedMinor == null && input.incurredMinor == null),
        purchaseOrderId: input.purchaseOrderId ?? null,
        vendorBillId: input.vendorBillId ?? null,
        status: input.status ?? "EXPECTED",
      },
      update: {
        label: input.label,
        expectedMinor: input.expectedMinor,
        committedMinor: input.committedMinor,
        incurredMinor: input.incurredMinor,
        paidMinor: input.paidMinor,
        costMissing: input.costMissing,
        purchaseOrderId: input.purchaseOrderId,
        vendorBillId: input.vendorBillId,
        status: input.status,
        updatedAt: new Date(),
      },
    });
    return { expense: row };
  } catch (e) {
    return { error: "Duplicate expense attribution" as const };
  }
}

export type CommercialPerformance = {
  campaignId: string;
  currency: string;
  revenueMinor: number;
  directCostMinor: number;
  grossProfitMinor: number | null;
  calculationBasis: string;
  missingCostFlags: string[];
};

export async function campaignCommercialPerformance(
  db: Db,
  campaignId: string
): Promise<CommercialPerformance> {
  const invs = await db.invoice.findMany({
    where: {
      campaignId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] },
    },
    select: { totalMinor: true, amountCreditedMinor: true, currency: true },
  });
  const expenses = await db.campaignExpense.findMany({
    where: { campaignId, status: { not: "VOID" } },
  });

  const revenueMinor = invs.reduce((s, i) => s + (i.totalMinor - i.amountCreditedMinor), 0);
  const missing = expenses.filter((e) => e.costMissing).map((e) => e.attributionKey);
  const knownCosts = expenses.filter((e) => !e.costMissing);
  const directCostMinor = knownCosts.reduce(
    (s, e) => s + Math.max(e.incurredMinor, e.committedMinor, e.expectedMinor),
    0
  );
  const currency = invs[0]?.currency ?? "INR";

  return {
    campaignId,
    currency,
    revenueMinor,
    directCostMinor,
    grossProfitMinor: missing.length ? null : revenueMinor - directCostMinor,
    calculationBasis:
      "Revenue = issued invoice totals − credits. Direct cost = max(expected, committed, incurred) for non-missing expenses. Gross profit null when any cost is flagged missing.",
    missingCostFlags: missing,
  };
}

/** Staff-only serializer — never use on customer routes. */
export function staffExpenseView(e: {
  id: string;
  label: string;
  status: string;
  expectedMinor: number;
  committedMinor: number;
  incurredMinor: number;
  paidMinor: number;
  costMissing: boolean;
  attributionKey: string;
}) {
  return { ...e };
}
