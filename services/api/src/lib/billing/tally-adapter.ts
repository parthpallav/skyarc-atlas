/**
 * Tally / accounting export adapter.
 * FILE_EXPORT is supported as a documented payload; LIVE_SYNC stays UNAVAILABLE
 * until a verified contract and configuration exist.
 */
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

type Db = PrismaClient;

export type TallyExportResult =
  | {
      kind: "FILE_EXPORT";
      status: "EXPORTED" | "READY";
      batchId: string;
      stableBatchKey: string;
      reconciliationStatus: string;
      filePayload: Record<string, unknown>;
    }
  | {
      kind: "LIVE_SYNC";
      status: "UNAVAILABLE";
      reason: string;
    };

export function validateTallyMapping(rows: Array<{ id: string; totalMinor: number; invoiceNumber: string | null }>) {
  const errors: string[] = [];
  for (const r of rows) {
    if (!r.invoiceNumber) errors.push(`${r.id}: missing invoice number`);
    if (!(r.totalMinor >= 0)) errors.push(`${r.id}: invalid total`);
  }
  return { ok: errors.length === 0, errors };
}

export async function createTallyFileExport(
  db: Db,
  input: {
    tenantOrganizationId: string;
    invoiceIds: string[];
    liveSync?: boolean;
  }
): Promise<TallyExportResult> {
  if (input.liveSync) {
    return {
      kind: "LIVE_SYNC",
      status: "UNAVAILABLE",
      reason:
        "Live Tally synchronization is unavailable until the accounting contract and configuration are verified.",
    };
  }

  const invoices = await db.invoice.findMany({
    where: {
      id: { in: input.invoiceIds },
      tenantOrganizationId: input.tenantOrganizationId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] },
    },
    include: { lines: true, payments: true },
  });

  const mapping = validateTallyMapping(
    invoices.map((i) => ({
      id: i.id,
      totalMinor: i.totalMinor,
      invoiceNumber: i.invoiceNumber,
    }))
  );

  const stableBatchKey = createHash("sha256")
    .update([...input.invoiceIds].sort().join("|") + "|" + input.tenantOrganizationId)
    .digest("hex")
    .slice(0, 32);

  const existing = await db.accountingExportBatch.findUnique({
    where: { stableBatchKey },
  });
  if (existing && existing.status === "EXPORTED") {
    return {
      kind: "FILE_EXPORT",
      status: "EXPORTED",
      batchId: existing.id,
      stableBatchKey,
      reconciliationStatus: existing.reconciliationStatus,
      filePayload: existing.payloadJson as Record<string, unknown>,
    };
  }

  const filePayload = {
    adapter: "tally-file",
    exportKind: "FILE_EXPORT",
    generatedAt: new Date().toISOString(),
    mappingValidation: mapping,
    vouchers: invoices.map((inv) => ({
      stableId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      currency: inv.currency,
      totalMinor: inv.totalMinor,
      amountPaidMinor: inv.amountPaidMinor,
      lines: inv.lines.map((l) => ({
        description: l.description,
        amountMinor: l.amountMinor,
        kind: l.kind,
      })),
      payments: inv.payments.map((p) => ({
        amountMinor: p.amountMinor,
        method: p.method,
        reference: p.reference,
        status: p.status,
        providerConfirmed: p.method === "PROVIDER" && p.status === "RECONCILED",
      })),
    })),
  };

  const batch = existing
    ? await db.accountingExportBatch.update({
        where: { id: existing.id },
        data: {
          status: mapping.ok ? "EXPORTED" : "FAILED",
          mappingValidationJson: mapping,
          payloadJson: filePayload,
          exportedAt: mapping.ok ? new Date() : null,
          updatedAt: new Date(),
        },
      })
    : await db.accountingExportBatch.create({
        data: {
          tenantOrganizationId: input.tenantOrganizationId,
          kind: "FILE_EXPORT",
          status: mapping.ok ? "EXPORTED" : "FAILED",
          adapter: "tally-file",
          stableBatchKey,
          mappingValidationJson: mapping,
          reconciliationStatus: "UNRECONCILED",
          payloadJson: filePayload,
          exportedAt: mapping.ok ? new Date() : null,
        },
      });

  return {
    kind: "FILE_EXPORT",
    status: mapping.ok ? "EXPORTED" : "READY",
    batchId: batch.id,
    stableBatchKey,
    reconciliationStatus: batch.reconciliationStatus,
    filePayload,
  };
}
