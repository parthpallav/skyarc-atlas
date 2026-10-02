-- Immutable QuoteRevision for commercial accept → reserve

DO $$ BEGIN
  CREATE TYPE "QuoteRevisionStatus" AS ENUM (
    'DRAFT',
    'ISSUED',
    'ACCEPTED',
    'EXPIRED',
    'SUPERSEDED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "QuoteRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID,
  "mediaPlanId" UUID,
  "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "QuoteRevisionStatus" NOT NULL DEFAULT 'ISSUED',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "subtotalMinor" INTEGER NOT NULL,
  "taxMinor" INTEGER NOT NULL DEFAULT 0,
  "totalMinor" INTEGER NOT NULL,
  "assumptionsJson" JSONB NOT NULL DEFAULT '{}',
  "quantitiesJson" JSONB NOT NULL DEFAULT '{}',
  "rateVersionsJson" JSONB NOT NULL DEFAULT '[]',
  "chargesJson" JSONB NOT NULL DEFAULT '[]',
  "inventoryIds" JSONB NOT NULL DEFAULT '[]',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedBookingId" UUID,
  "acceptedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QuoteRevision_campaignId_status_idx"
  ON "QuoteRevision"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "QuoteRevision_tenantOrganizationId_status_idx"
  ON "QuoteRevision"("tenantOrganizationId", "status");
CREATE INDEX IF NOT EXISTS "QuoteRevision_expiresAt_idx"
  ON "QuoteRevision"("expiresAt");
CREATE INDEX IF NOT EXISTS "QuoteRevision_status_expiresAt_idx"
  ON "QuoteRevision"("status", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "QuoteRevision"
    ADD CONSTRAINT "QuoteRevision_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
