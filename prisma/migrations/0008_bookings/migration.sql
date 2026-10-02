-- Explicit Booking / BookingItem ledger (AvailabilityWindow remains capacity authority)

DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM (
    'REQUESTED',
    'HELD',
    'PENDING_VENDOR_APPROVAL',
    'PARTIALLY_APPROVED',
    'CONFIRMED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BookingItemStatus" AS ENUM (
    'REQUESTED',
    'HELD',
    'PENDING_VENDOR_APPROVAL',
    'APPROVED',
    'REJECTED',
    'CONFIRMED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BookingPaymentStatus" AS ENUM (
    'NOT_REQUIRED',
    'PENDING',
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'UNAVAILABLE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BookingExecutionStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETED',
    'INTERRUPTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AvailabilityWindow"
  ADD COLUMN IF NOT EXISTS "campaignId" UUID;

DO $$ BEGIN
  ALTER TABLE "AvailabilityWindow"
    ADD CONSTRAINT "AvailabilityWindow_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "AvailabilityWindow_campaignId_status_idx"
  ON "AvailabilityWindow"("campaignId", "status");

CREATE TABLE IF NOT EXISTS "Booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL,
  "mediaPlanId" UUID,
  "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
  "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "executionStatus" "BookingExecutionStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "idempotencyKey" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Booking_idempotencyKey_key"
  ON "Booking"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Booking_campaignId_status_idx"
  ON "Booking"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "Booking_tenantOrganizationId_status_idx"
  ON "Booking"("tenantOrganizationId", "status");
CREATE INDEX IF NOT EXISTS "Booking_expiresAt_idx"
  ON "Booking"("expiresAt");
CREATE INDEX IF NOT EXISTS "Booking_startDate_endDate_idx"
  ON "Booking"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "Booking_mediaPlanId_idx"
  ON "Booking"("mediaPlanId");

DO $$ BEGIN
  ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_tenantOrganizationId_fkey"
    FOREIGN KEY ("tenantOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_mediaPlanId_fkey"
    FOREIGN KEY ("mediaPlanId") REFERENCES "MediaPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BookingItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "inventoryId" UUID NOT NULL,
  "availabilityWindowId" UUID,
  "vendorOrganizationId" UUID,
  "status" "BookingItemStatus" NOT NULL DEFAULT 'HELD',
  "slotsConsumed" INTEGER NOT NULL DEFAULT 1,
  "mediaPlanItemId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BookingItem_availabilityWindowId_key"
  ON "BookingItem"("availabilityWindowId");
CREATE UNIQUE INDEX IF NOT EXISTS "BookingItem_bookingId_inventoryId_key"
  ON "BookingItem"("bookingId", "inventoryId");
CREATE INDEX IF NOT EXISTS "BookingItem_status_idx"
  ON "BookingItem"("status");
CREATE INDEX IF NOT EXISTS "BookingItem_vendorOrganizationId_status_idx"
  ON "BookingItem"("vendorOrganizationId", "status");
CREATE INDEX IF NOT EXISTS "BookingItem_inventoryId_idx"
  ON "BookingItem"("inventoryId");

DO $$ BEGIN
  ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BookingItem"
    ADD CONSTRAINT "BookingItem_availabilityWindowId_fkey"
    FOREIGN KEY ("availabilityWindowId") REFERENCES "AvailabilityWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BookingTransition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "bookingItemId" UUID,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "actorUserId" UUID,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookingTransition_bookingId_createdAt_idx"
  ON "BookingTransition"("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS "BookingTransition_bookingItemId_createdAt_idx"
  ON "BookingTransition"("bookingItemId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "BookingTransition"
    ADD CONSTRAINT "BookingTransition_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BookingTransition"
    ADD CONSTRAINT "BookingTransition_bookingItemId_fkey"
    FOREIGN KEY ("bookingItemId") REFERENCES "BookingItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill campaignId on windows from notes when present
UPDATE "AvailabilityWindow" aw
SET "campaignId" = sub.campaign_id
FROM (
  SELECT aw2.id AS window_id, c.id AS campaign_id
  FROM "AvailabilityWindow" aw2
  JOIN "Campaign" c ON aw2.notes LIKE '%' || c.id::text || '%'
  WHERE aw2."campaignId" IS NULL
    AND aw2.status IN ('HELD', 'BOOKED')
) AS sub
WHERE aw.id = sub.window_id;
