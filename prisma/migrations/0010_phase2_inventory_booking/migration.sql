-- Phase 2: inventory freshness, booking integration outbox, quote link, EXPIRED status

DO $$ BEGIN ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "BookingItemStatus" ADD VALUE 'EXPIRED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Inventory"
  ADD COLUMN IF NOT EXISTS "availabilityConfirmedAt" TIMESTAMP(3);

ALTER TABLE "Booking"
  ADD COLUMN IF NOT EXISTS "acceptedQuoteRevisionId" UUID;

DO $$ BEGIN
  ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_acceptedQuoteRevisionId_fkey"
    FOREIGN KEY ("acceptedQuoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Booking_acceptedQuoteRevisionId_idx"
  ON "Booking"("acceptedQuoteRevisionId");

CREATE TABLE IF NOT EXISTS "InventoryChangeLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "inventoryId" UUID NOT NULL,
  "actorUserId" UUID,
  "changeType" TEXT NOT NULL,
  "beforeJson" JSONB NOT NULL DEFAULT '{}',
  "afterJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryChangeLog_inventoryId_createdAt_idx"
  ON "InventoryChangeLog"("inventoryId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "InventoryChangeLog"
    ADD CONSTRAINT "InventoryChangeLog_inventoryId_fkey"
    FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BookingChangeOutbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  CONSTRAINT "BookingChangeOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BookingChangeOutbox_bookingId_createdAt_idx"
  ON "BookingChangeOutbox"("bookingId", "createdAt");
CREATE INDEX IF NOT EXISTS "BookingChangeOutbox_deliveredAt_idx"
  ON "BookingChangeOutbox"("deliveredAt");

DO $$ BEGIN
  ALTER TABLE "BookingChangeOutbox"
    ADD CONSTRAINT "BookingChangeOutbox_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure windows link to campaigns (notes backfill already in 0008)
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
