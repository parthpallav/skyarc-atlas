-- Payment intents + booking creatives for self-service checkout (sandbox-first).

CREATE TYPE "PaymentIntentStatus" AS ENUM (
  'CREATED',
  'PENDING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "BookingCreativeStatus" AS ENUM (
  'REQUIRED',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "PaymentIntent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "quoteRevisionId" UUID NOT NULL REFERENCES "QuoteRevision"("id") ON DELETE CASCADE,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "provider" TEXT NOT NULL,
  "providerRef" TEXT,
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
  "bookingId" UUID REFERENCES "Booking"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PaymentIntent_quoteRevisionId_idx" ON "PaymentIntent"("quoteRevisionId");
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

CREATE TABLE "PaymentEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "paymentIntentId" UUID NOT NULL REFERENCES "PaymentIntent"("id") ON DELETE CASCADE,
  "eventType" TEXT NOT NULL,
  "providerEventId" TEXT,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "signatureValid" BOOLEAN NOT NULL DEFAULT false,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PaymentEvent_paymentIntentId_providerEventId_key"
  ON "PaymentEvent"("paymentIntentId", "providerEventId");
CREATE INDEX "PaymentEvent_paymentIntentId_createdAt_idx"
  ON "PaymentEvent"("paymentIntentId", "createdAt");

CREATE TABLE "BookingCreative" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL REFERENCES "Booking"("id") ON DELETE CASCADE,
  "status" "BookingCreativeStatus" NOT NULL DEFAULT 'REQUIRED',
  "assetUrl" TEXT,
  "fileName" TEXT,
  "notes" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "BookingCreative_bookingId_status_idx" ON "BookingCreative"("bookingId", "status");
