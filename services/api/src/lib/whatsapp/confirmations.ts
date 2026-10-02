/**
 * Expiring confirmation tokens for WhatsApp-driven mutations.
 * Duplicate messages must not repeat the action.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient;

export type ConfirmableAction =
  | "RESERVE_INVENTORY"
  | "ACCEPT_QUOTE"
  | "AMEND_BOOKING"
  | "CANCEL_BOOKING"
  | "VENDOR_APPROVE";

export function hashConfirmationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function proposalFingerprint(action: ConfirmableAction, payload: unknown): string {
  return createHash("sha256")
    .update(action + ":" + JSON.stringify(payload))
    .digest("hex");
}

export async function createActionConfirmation(
  db: Db,
  input: {
    userId: string;
    tenantOrganizationId: string | null;
    action: ConfirmableAction;
    payload: Record<string, unknown>;
    ttlMinutes?: number;
  }
) {
  const raw = randomBytes(20).toString("base64url");
  const fingerprint = proposalFingerprint(input.action, input.payload);
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 15) * 60_000);
  const row = await db.whatsAppActionConfirmation.create({
    data: {
      userId: input.userId,
      tenantOrganizationId: input.tenantOrganizationId,
      action: input.action,
      payloadJson: input.payload as Prisma.InputJsonValue,
      fingerprint,
      tokenHash: hashConfirmationToken(raw),
      expiresAt,
    },
  });
  return { confirmationId: row.id, token: raw, expiresAt, fingerprint };
}

export async function consumeActionConfirmation(
  db: Db,
  input: {
    token: string;
    expectedAction: ConfirmableAction;
    expectedFingerprint?: string;
  }
) {
  const tokenHash = hashConfirmationToken(input.token);
  const row = await db.whatsAppActionConfirmation.findFirst({ where: { tokenHash } });
  if (!row) return { error: "Confirmation not found" as const };
  if (row.consumedAt) return { error: "Confirmation already used" as const, idempotentKey: row.id };
  if (row.expiresAt.getTime() < Date.now()) return { error: "Confirmation expired" as const };
  if (row.action !== input.expectedAction) {
    return { error: "Confirmation action mismatch" as const };
  }
  if (input.expectedFingerprint && row.fingerprint !== input.expectedFingerprint) {
    return { error: "Confirmation payload changed — request a new confirmation" as const };
  }

  const updated = await db.whatsAppActionConfirmation.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return {
    confirmation: updated,
    payload: updated.payloadJson as Record<string, unknown>,
  };
}
