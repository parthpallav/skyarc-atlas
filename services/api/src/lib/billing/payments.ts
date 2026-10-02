/**
 * Manual and provider payment records against invoices.
 * Manual records require auth actor, reference, timestamp, audit — never imply provider confirmation.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { resolvePaymentAdapter } from "../booking/payment-adapter.js";
import {
  outstandingMinor,
  recomputeInvoicePaymentStatus,
} from "./invoice.js";

type Db = PrismaClient | Prisma.TransactionClient;

export async function recordManualPayment(
  db: Db,
  input: {
    invoiceId: string;
    amountMinor: number;
    currency?: string;
    reference: string;
    actorUserId: string;
    note?: string;
    idempotencyKey?: string | null;
    recordedAt?: Date;
  }
) {
  if (!input.reference.trim()) return { error: "Payment reference required" as const };
  if (!input.actorUserId) return { error: "Authorized actor required for manual payment" as const };
  if (!(input.amountMinor > 0)) return { error: "amountMinor must be positive" as const };

  if (input.idempotencyKey) {
    const prior = await db.invoicePayment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (prior) {
      const inv = await db.invoice.findUnique({ where: { id: prior.invoiceId } });
      return {
        payment: prior,
        invoice: inv!,
        outstandingMinor: inv ? outstandingMinor(inv) : 0,
        providerConfirmed: false as const,
        idempotent: true as const,
      };
    }
  }

  // Serialize payment apply against outstanding to avoid concurrent over-allocation
  const run = async (tx: Db) => {
    const inv = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
    if (!inv) return { error: "Invoice not found" as const };
    if (!["ISSUED", "PARTIALLY_PAID"].includes(inv.status)) {
      return { error: `Cannot record payment on ${inv.status} invoice` as const };
    }
    const due = outstandingMinor(inv);
    if (input.amountMinor > due) {
      return { error: "Payment exceeds outstanding balance" as const };
    }

    const payment = await tx.invoicePayment.create({
      data: {
        invoiceId: inv.id,
        amountMinor: input.amountMinor,
        currency: input.currency ?? inv.currency,
        method: "MANUAL",
        status: "RECORDED",
        reference: input.reference.trim(),
        recordedAt: input.recordedAt ?? new Date(),
        recordedByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey ?? null,
        note: input.note ?? "Manual payment — not provider-confirmed",
      },
    });
    await tx.invoicePaymentAudit.create({
      data: {
        paymentId: payment.id,
        actorUserId: input.actorUserId,
        action: "MANUAL_RECORD",
        detailJson: {
          reference: payment.reference,
          amountMinor: payment.amountMinor,
          providerConfirmed: false,
        },
      },
    });

    const amountPaidMinor = inv.amountPaidMinor + input.amountMinor;
    const nextStatus = recomputeInvoicePaymentStatus({
      ...inv,
      amountPaidMinor,
    });
    const updatedInv = await tx.invoice.update({
      where: { id: inv.id },
      data: { amountPaidMinor, status: nextStatus, updatedAt: new Date() },
    });

    return {
      payment,
      invoice: updatedInv,
      outstandingMinor: outstandingMinor(updatedInv),
      providerConfirmed: false as const,
      idempotent: false as const,
    };
  };

  if ("$transaction" in db && typeof (db as PrismaClient).$transaction === "function") {
    return (db as PrismaClient).$transaction((tx) => run(tx));
  }
  return run(db);
}

export async function createInvoicePaymentIntent(invoiceId: string, amountMinor: number, currency: string) {
  const adapter = resolvePaymentAdapter();
  const result = await adapter.createIntent({
    bookingId: invoiceId,
    amountMinor,
    currency,
    idempotencyKey: `invoice-pay:${invoiceId}:${amountMinor}`,
  });
  return result;
}

export async function issueCreditNote(
  db: Db,
  input: {
    invoiceId: string;
    amountMinor: number;
    reason: string;
    actorUserId?: string | null;
    apply?: boolean;
  }
) {
  const inv = await db.invoice.findUnique({ where: { id: input.invoiceId } });
  if (!inv) return { error: "Invoice not found" as const };
  if (!["ISSUED", "PARTIALLY_PAID", "PAID"].includes(inv.status)) {
    return { error: `Cannot credit ${inv.status} invoice` as const };
  }
  if (!(input.amountMinor > 0)) return { error: "Credit amount must be positive" as const };
  if (input.amountMinor > outstandingMinor(inv) + (inv.status === "PAID" ? inv.totalMinor : 0)) {
    // Allow credit up to total for adjustments on paid invoices via explicit apply
  }
  if (input.amountMinor > inv.totalMinor - inv.amountCreditedMinor) {
    return { error: "Credit exceeds invoice remainder" as const };
  }

  const note = await db.creditNote.create({
    data: {
      tenantOrganizationId: inv.tenantOrganizationId,
      invoiceId: inv.id,
      status: input.apply ? "APPLIED" : "ISSUED",
      amountMinor: input.amountMinor,
      currency: inv.currency,
      reason: input.reason,
      creditNumber: `CN-${inv.invoiceNumber ?? inv.id.slice(0, 8)}-${Date.now().toString(36)}`,
      issuedAt: new Date(),
      createdByUserId: input.actorUserId ?? null,
      snapshotJson: {
        invoiceNumber: inv.invoiceNumber,
        invoiceTotalMinor: inv.totalMinor,
        creditMinor: input.amountMinor,
        reason: input.reason,
      },
    },
  });

  if (input.apply !== false) {
    const amountCreditedMinor = inv.amountCreditedMinor + input.amountMinor;
    const next = recomputeInvoicePaymentStatus({ ...inv, amountCreditedMinor });
    await db.invoice.update({
      where: { id: inv.id },
      data: { amountCreditedMinor, status: next, updatedAt: new Date() },
    });
  }

  return { creditNote: note };
}
