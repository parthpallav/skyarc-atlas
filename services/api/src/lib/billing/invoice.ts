/**
 * Invoice drafts from accepted QuoteRevision commercial snapshots (ADR-0003).
 * Issued invoices freeze snapshot; corrections via credit notes / new drafts only.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { addMinor, totalsMatch } from "../booking/money.js";

type Db = PrismaClient | Prisma.TransactionClient;

function outstandingMinor(inv: {
  totalMinor: number;
  amountPaidMinor: number;
  amountCreditedMinor: number;
}): number {
  return Math.max(0, inv.totalMinor - inv.amountPaidMinor - inv.amountCreditedMinor);
}

export { outstandingMinor };

export async function allocateInvoiceNumber(
  db: Db,
  tenantOrganizationId: string,
  prefix = "INV"
): Promise<string> {
  // Serializable-friendly upsert + increment
  const existing = await db.invoiceNumberSequence.findUnique({
    where: {
      tenantOrganizationId_prefix: { tenantOrganizationId, prefix },
    },
  });
  if (!existing) {
    await db.invoiceNumberSequence.create({
      data: { tenantOrganizationId, prefix, nextNumber: 2 },
    });
    return `${prefix}-${String(1).padStart(5, "0")}`;
  }
  const n = existing.nextNumber;
  await db.invoiceNumberSequence.update({
    where: { id: existing.id },
    data: { nextNumber: n + 1 },
  });
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

export async function createInvoiceDraftFromBooking(
  db: Db,
  input: {
    bookingId: string;
    actorUserId?: string | null;
    paymentTerms?: string;
    dueInDays?: number;
    taxRateBps?: number; // basis points, e.g. 1800 = 18%
  }
) {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      acceptedQuoteRevision: true,
      campaign: { include: { advertiser: true } },
    },
  });
  if (!booking) return { error: "Booking not found" as const };
  if (booking.status !== "CONFIRMED" && booking.status !== "PARTIALLY_APPROVED") {
    return { error: "Invoice requires a confirmed booking" as const };
  }
  const quote = booking.acceptedQuoteRevision;
  if (!quote || quote.status !== "ACCEPTED") {
    return { error: "Booking has no accepted quote snapshot" as const };
  }

  const taxRateBps = input.taxRateBps ?? 0;
  const subtotalMinor = quote.subtotalMinor;
  const taxMinor =
    quote.taxMinor > 0
      ? quote.taxMinor
      : Math.round((subtotalMinor * taxRateBps) / 10_000);
  const totalMinor = quote.taxMinor > 0 ? quote.totalMinor : addMinor(subtotalMinor, taxMinor);
  if (!totalsMatch(totalMinor, addMinor(subtotalMinor, taxMinor))) {
    return { error: "Quote totals inconsistent" as const };
  }

  type LineCreate = {
    kind: "MEDIA" | "PRODUCTION" | "TAX" | "ADJUSTMENT" | "OTHER";
    description: string;
    inventoryId: string | null;
    quantity: number;
    unitMinor: number;
    amountMinor: number;
    taxMinor: number;
    sortOrder: number;
  };
  const charges = (quote.chargesJson as Array<Record<string, unknown>>) ?? [];
  const lines: LineCreate[] =
    charges.length > 0
      ? charges.map((c, idx) => ({
          kind: "MEDIA" as const,
          description: String(c.description ?? c.inventoryId ?? `Line ${idx + 1}`),
          inventoryId: typeof c.inventoryId === "string" ? c.inventoryId : null,
          quantity: 1,
          unitMinor: Number(c.totalMinor ?? c.amountMinor ?? 0),
          amountMinor: Number(c.totalMinor ?? c.amountMinor ?? 0),
          taxMinor: 0,
          sortOrder: idx,
        }))
      : [
          {
            kind: "MEDIA",
            description: `Media — ${booking.campaign.name}`,
            inventoryId: null,
            quantity: 1,
            unitMinor: subtotalMinor,
            amountMinor: subtotalMinor,
            taxMinor: 0,
            sortOrder: 0,
          },
        ];

  if (taxMinor > 0) {
    lines.push({
      kind: "TAX",
      description: "Tax",
      inventoryId: null,
      quantity: 1,
      unitMinor: taxMinor,
      amountMinor: taxMinor,
      taxMinor: 0,
      sortOrder: lines.length,
    });
  }

  const dueAt = new Date();
  dueAt.setUTCDate(dueAt.getUTCDate() + (input.dueInDays ?? 30));

  const invoice = await db.invoice.create({
    data: {
      tenantOrganizationId: booking.tenantOrganizationId,
      campaignId: booking.campaignId,
      bookingId: booking.id,
      quoteRevisionId: quote.id,
      status: "DRAFT",
      currency: quote.currency,
      subtotalMinor,
      taxMinor,
      totalMinor,
      amountPaidMinor: 0,
      amountCreditedMinor: 0,
      paymentTerms: input.paymentTerms ?? "Net 30",
      dueAt,
      createdByUserId: input.actorUserId ?? null,
      commercialSnapshotJson: {
        status: "DRAFT",
        advertiserName: booking.campaign.advertiser.name,
        campaignName: booking.campaign.name,
        quoteRevisionId: quote.id,
        quoteRevisionNumber: quote.revisionNumber,
        currency: quote.currency,
        subtotalMinor,
        taxMinor,
        totalMinor,
        charges: lines.map((l) => ({
          description: l.description,
          amountMinor: l.amountMinor,
          kind: l.kind,
        })),
      },
      lines: { create: lines },
    },
    include: { lines: true },
  });

  return { invoice };
}

export async function issueInvoice(db: Db, invoiceId: string, _actorUserId?: string | null) {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { lines: true },
  });
  if (!inv) return { error: "Invoice not found" as const };
  if (inv.status !== "DRAFT") return { error: `Cannot issue from ${inv.status}` as const };
  if (!inv.tenantOrganizationId) {
    return { error: "Tenant organization required for invoice numbering" as const };
  }

  const invoiceNumber = await allocateInvoiceNumber(db, inv.tenantOrganizationId);
  const snapshot = {
    ...(inv.commercialSnapshotJson as Record<string, unknown>),
    status: "ISSUED",
    invoiceNumber,
    issuedAt: new Date().toISOString(),
    lines: inv.lines.map((l) => ({
      description: l.description,
      amountMinor: l.amountMinor,
      kind: l.kind,
    })),
  };

  const updated = await db.invoice.update({
    where: { id: inv.id },
    data: {
      status: "ISSUED",
      invoiceNumber,
      issuedAt: new Date(),
      commercialSnapshotJson: snapshot as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
    include: { lines: true },
  });
  return { invoice: updated };
}

export async function voidInvoice(db: Db, invoiceId: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return { error: "Invoice not found" as const };
  if (inv.amountPaidMinor > 0) return { error: "Cannot void invoice with payments" as const };
  if (!["DRAFT", "ISSUED"].includes(inv.status)) {
    return { error: `Cannot void from ${inv.status}` as const };
  }
  const updated = await db.invoice.update({
    where: { id: inv.id },
    data: { status: "VOID", voidedAt: new Date(), updatedAt: new Date() },
  });
  return { invoice: updated };
}

export function recomputeInvoicePaymentStatus(inv: {
  totalMinor: number;
  amountPaidMinor: number;
  amountCreditedMinor: number;
  status: string;
}): "ISSUED" | "PARTIALLY_PAID" | "PAID" {
  const due = outstandingMinor(inv);
  if (due <= 0) return "PAID";
  if (inv.amountPaidMinor > 0) return "PARTIALLY_PAID";
  return "ISSUED";
}

export function customerSafeInvoice(inv: {
  id: string;
  invoiceNumber: string | null;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  amountCreditedMinor: number;
  dueAt: Date | null;
  issuedAt: Date | null;
  paymentTerms: string | null;
  commercialSnapshotJson: unknown;
  lines?: Array<{
    description: string;
    amountMinor: number;
    kind: string;
  }>;
}) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    currency: inv.currency,
    subtotalMinor: inv.subtotalMinor,
    taxMinor: inv.taxMinor,
    totalMinor: inv.totalMinor,
    amountPaidMinor: inv.amountPaidMinor,
    amountCreditedMinor: inv.amountCreditedMinor,
    outstandingMinor: outstandingMinor(inv),
    dueAt: inv.dueAt?.toISOString() ?? null,
    issuedAt: inv.issuedAt?.toISOString() ?? null,
    paymentTerms: inv.paymentTerms,
    snapshot: inv.commercialSnapshotJson,
    lines: inv.lines?.map((l) => ({
      description: l.description,
      amountMinor: l.amountMinor,
      kind: l.kind,
    })),
  };
}
