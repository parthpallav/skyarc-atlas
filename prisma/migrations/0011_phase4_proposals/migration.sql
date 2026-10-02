-- Phase 4: scenario proposals + share tokens
DO $$ BEGIN
  CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'SUPERSEDED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ScenarioKind" AS ENUM ('COVERAGE', 'CONCENTRATION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProposalRevision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL,
  "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "ProposalStatus" NOT NULL DEFAULT 'ISSUED',
  "scenarioKind" "ScenarioKind" NOT NULL,
  "quoteRevisionId" UUID,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "totalMinor" INTEGER NOT NULL,
  "snapshotJson" JSONB NOT NULL DEFAULT '{}',
  "assumptionsJson" JSONB NOT NULL DEFAULT '{}',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedBookingId" UUID,
  "acceptedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ProposalRevision_campaignId_status_idx" ON "ProposalRevision"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "ProposalRevision_tenantOrganizationId_status_idx" ON "ProposalRevision"("tenantOrganizationId", "status");
CREATE INDEX IF NOT EXISTS "ProposalRevision_quoteRevisionId_idx" ON "ProposalRevision"("quoteRevisionId");

DO $$ BEGIN
  ALTER TABLE "ProposalRevision"
    ADD CONSTRAINT "ProposalRevision_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProposalRevision"
    ADD CONSTRAINT "ProposalRevision_quoteRevisionId_fkey"
    FOREIGN KEY ("quoteRevisionId") REFERENCES "QuoteRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProposalShareToken" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposalRevisionId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProposalShareToken_tokenHash_key" ON "ProposalShareToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "ProposalShareToken_proposalRevisionId_idx" ON "ProposalShareToken"("proposalRevisionId");

DO $$ BEGIN
  ALTER TABLE "ProposalShareToken"
    ADD CONSTRAINT "ProposalShareToken_proposalRevisionId_fkey"
    FOREIGN KEY ("proposalRevisionId") REFERENCES "ProposalRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
