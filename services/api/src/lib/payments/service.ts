import type { PrismaClient } from "@prisma/client";
import { validationError } from "../errors.js";
import { getPaymentAdapter, resolvePaymentsProvider } from "./provider.js";
import { signTestWebhook } from "./test-provider.js";
import type { CreateIntentInput, CreateIntentResult } from "./types.js";

export async function createPaymentIntent(
  prisma: PrismaClient,
  input: CreateIntentInput
): Promise<CreateIntentResult> {
  if (resolvePaymentsProvider() === "disabled") {
    throw validationError("Payments are disabled in this environment");
  }

  const existing = await prisma.paymentIntent.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    return {
      paymentIntentId: existing.id,
      provider: existing.provider as "test",
      providerRef: existing.providerRef ?? "",
      amountMinor: existing.amountMinor,
      currency: existing.currency,
      status: existing.status,
    };
  }

  const quote = await prisma.quoteRevision.findUnique({
    where: { id: input.quoteRevisionId },
  });
  if (!quote) throw validationError("Quote not found");
  if (quote.status !== "ISSUED" && quote.status !== "ACCEPTED") {
    throw validationError("Quote is not payable in its current status");
  }
  if (quote.expiresAt < new Date()) {
    throw validationError("Quote has expired");
  }

  const adapter = getPaymentAdapter();
  const providerResult = await adapter.createIntent({
    amountMinor: quote.totalMinor,
    currency: quote.currency,
    idempotencyKey: input.idempotencyKey,
    metadata: { quoteRevisionId: quote.id },
  });

  const intent = await prisma.paymentIntent.create({
    data: {
      quoteRevisionId: quote.id,
      amountMinor: quote.totalMinor,
      currency: quote.currency,
      idempotencyKey: input.idempotencyKey,
      provider: adapter.name,
      providerRef: providerResult.providerRef,
      status: "PENDING",
      bookingId: quote.acceptedBookingId,
    },
  });

  if (quote.acceptedBookingId) {
    await prisma.booking.update({
      where: { id: quote.acceptedBookingId },
      data: { paymentStatus: "PENDING" },
    });
  }

  const result: CreateIntentResult = {
    paymentIntentId: intent.id,
    provider: adapter.name,
    providerRef: intent.providerRef ?? "",
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    status: intent.status,
  };

  if (adapter.name === "test") {
    result.testCaptureToken = signTestWebhook(
      JSON.stringify({
        eventType: "payment.captured",
        eventId: `test_evt_${intent.id}`,
        paymentIntentId: intent.id,
        providerRef: intent.providerRef,
      })
    );
  }

  return result;
}

export async function reconcilePaymentWebhook(
  prisma: PrismaClient,
  input: {
    paymentIntentId: string;
    eventType: string;
    providerEventId: string;
    signatureValid: boolean;
    payload: Record<string, unknown>;
  }
) {
  if (!input.signatureValid) {
    throw validationError("Invalid payment webhook signature");
  }

  const intent = await prisma.paymentIntent.findUnique({
    where: { id: input.paymentIntentId },
    include: { quoteRevision: true },
  });
  if (!intent) throw validationError("Payment intent not found");

  const dup = await prisma.paymentEvent.findFirst({
    where: {
      paymentIntentId: intent.id,
      providerEventId: input.providerEventId,
    },
  });
  if (dup?.processedAt) {
    return { paymentIntentId: intent.id, status: intent.status, duplicate: true };
  }

  try {
    await prisma.paymentEvent.create({
      data: {
        paymentIntentId: intent.id,
        eventType: input.eventType,
        providerEventId: input.providerEventId,
        payloadJson: input.payload,
        signatureValid: true,
        processedAt: new Date(),
      },
    });
  } catch (err) {
    const duplicate =
      err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002";
    if (!duplicate) throw err;
    if (dup?.processedAt) {
      return { paymentIntentId: intent.id, status: intent.status, duplicate: true };
    }
  }

  let nextStatus = intent.status;
  let bookingPaymentStatus: "PENDING" | "CAPTURED" | "FAILED" | "AUTHORIZED" | undefined;

  if (input.eventType === "payment.captured") {
    if (intent.amountMinor !== Number(input.payload.amountMinor ?? intent.amountMinor)) {
      throw validationError("Payment amount mismatch");
    }
    nextStatus = "CAPTURED";
    bookingPaymentStatus = "CAPTURED";
  } else if (input.eventType === "payment.failed") {
    nextStatus = "FAILED";
    bookingPaymentStatus = "FAILED";
  } else if (input.eventType === "payment.authorized") {
    nextStatus = "AUTHORIZED";
    bookingPaymentStatus = "AUTHORIZED";
  }

  const updated = await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: { status: nextStatus },
  });

  const bookingId = intent.bookingId ?? intent.quoteRevision.acceptedBookingId;
  if (bookingId && bookingPaymentStatus) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: bookingPaymentStatus },
    });
  }

  return { paymentIntentId: updated.id, status: updated.status, duplicate: false };
}
