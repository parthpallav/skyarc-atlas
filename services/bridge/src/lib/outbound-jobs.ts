/**
 * Durable outbound WhatsApp jobs with retry + idempotency.
 * Provider acceptance ≠ delivered.
 */
import type { PrismaClient } from "../generated/prisma/index.js";
import type { BridgeEnv } from "../env.js";
import { whatsappConfigured } from "../env.js";
import { sendWhatsAppMessage } from "../providers/whatsapp-cloud.js";
import {
  assertOutboundAllowed,
  type DeliveryStatus,
} from "./whatsapp-policy.js";

export type EnqueueWhatsAppInput = {
  toE164: string;
  text?: string;
  documentUrl?: string;
  documentFilename?: string;
  documentBase64?: string;
  idempotencyKey?: string;
  templateName?: string;
  hasConsent?: boolean;
  lastUserMessageAt?: string | null;
};

export async function enqueueWhatsAppJob(prisma: PrismaClient, env: BridgeEnv, input: EnqueueWhatsAppInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.outboundMessage.findFirst({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { message: existing, idempotent: true as const };
    }
  }

  const dryRun = !whatsappConfigured(env);
  const policy = assertOutboundAllowed(
    { lastUserMessageAt: input.lastUserMessageAt ? new Date(input.lastUserMessageAt) : null },
    input.templateName
      ? { kind: "template", templateName: input.templateName }
      : input.documentUrl || input.documentBase64
        ? { kind: "session_with_document", text: input.text }
        : { kind: "session_text", text: input.text ?? "" },
    { hasConsent: Boolean(input.hasConsent), dryRun }
  );
  if (!policy.ok) {
    return { error: policy.error };
  }

  const row = await prisma.outboundMessage.create({
    data: {
      channel: "whatsapp",
      toE164: input.toE164,
      bodyPreview: input.text?.slice(0, 200) ?? input.templateName ?? null,
      status: "queued",
      deliveryStatus: "queued",
      idempotencyKey: input.idempotencyKey ?? null,
      attemptCount: 0,
      payloadJson: {
        hasDocument: Boolean(input.documentBase64 || input.documentUrl),
        templateName: input.templateName ?? null,
        dryRun,
      },
    },
  });

  return { message: row, idempotent: false as const, dryRun };
}

export async function processOutboundJob(
  prisma: PrismaClient,
  env: BridgeEnv,
  messageId: string
) {
  const row = await prisma.outboundMessage.findUnique({ where: { id: messageId } });
  if (!row) return { error: "Message not found" as const };
  if (["delivered", "read", "dry_run"].includes(row.deliveryStatus)) {
    return { message: row, skipped: true as const };
  }

  const payload = row.payloadJson as {
    hasDocument?: boolean;
    text?: string;
    documentBase64?: string;
    documentUrl?: string;
    documentFilename?: string;
  };

  await prisma.outboundMessage.update({
    where: { id: row.id },
    data: { attemptCount: row.attemptCount + 1, status: "processing", updatedAt: new Date() },
  });

  try {
    // Prefer fields stored on enqueue; callers may pass text in bodyPreview
    const result = await sendWhatsAppMessage(env, {
      toE164: row.toE164,
      text: payload.text ?? row.bodyPreview ?? undefined,
      documentUrl: payload.documentUrl,
      documentFilename: payload.documentFilename,
      documentBuffer: payload.documentBase64
        ? Buffer.from(payload.documentBase64, "base64")
        : undefined,
    });

    const deliveryStatus: DeliveryStatus = result.dryRun
      ? "dry_run"
      : result.partial
        ? "partial"
        : "submitted";

    const updated = await prisma.outboundMessage.update({
      where: { id: row.id },
      data: {
        status: deliveryStatus,
        deliveryStatus,
        providerMessageId: result.providerMessageId,
        error: result.partialDetail ?? null,
        updatedAt: new Date(),
      },
    });
    return { message: updated, dryRun: result.dryRun };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    const attempts = row.attemptCount + 1;
    const nextRetryAt =
      attempts < 5 ? new Date(Date.now() + Math.min(60_000 * 2 ** attempts, 3600_000)) : null;
    const updated = await prisma.outboundMessage.update({
      where: { id: row.id },
      data: {
        status: "failed",
        deliveryStatus: "failed",
        error: message,
        nextRetryAt,
        updatedAt: new Date(),
      },
    });
    return { message: updated, error: message };
  }
}

export async function applyWebhookReceipt(
  prisma: PrismaClient,
  input: {
    providerEventId: string;
    providerMessageId: string;
    status: string;
    raw: unknown;
    signatureVerified: boolean;
  }
) {
  if (!input.signatureVerified) {
    return { error: "Webhook signature not verified" as const };
  }

  const prior = await prisma.inboundEvent.findFirst({
    where: { providerEventId: input.providerEventId },
  });
  if (prior) {
    return { inbound: prior, deduplicated: true as const };
  }

  const inbound = await prisma.inboundEvent.create({
    data: {
      channel: "whatsapp",
      payloadJson: input.raw as object,
      providerEventId: input.providerEventId,
      signatureVerified: true,
      processed: false,
    },
  });

  const { mapProviderReceiptStatus } = await import("./whatsapp-policy.js");
  const mapped = mapProviderReceiptStatus(input.status);
  if (mapped && input.providerMessageId) {
    await prisma.outboundMessage.updateMany({
      where: { providerMessageId: input.providerMessageId },
      data: {
        deliveryStatus: mapped,
        status: mapped,
        receiptJson: input.raw as object,
        updatedAt: new Date(),
      },
    });
  }

  await prisma.inboundEvent.update({
    where: { id: inbound.id },
    data: { processed: true },
  });

  return { inbound, deduplicated: false as const, deliveryStatus: mapped };
}

