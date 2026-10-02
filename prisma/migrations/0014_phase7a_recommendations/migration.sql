-- Phase 7A: commercial continuity + fill-rate recommendations
DO $$ BEGIN CREATE TYPE "CommercialRecommendationKind" AS ENUM ('CONTINUITY_REPLACEMENT','FILL_RATE_PACKAGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommercialRecommendationStatus" AS ENUM ('OPEN','APPROVED','DISMISSED','APPLIED','EXPIRED','SUPERSEDED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RecommendationMethod" AS ENUM ('DETERMINISTIC_RULE','HEURISTIC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "CommercialRecommendation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "kind" "CommercialRecommendationKind" NOT NULL,
  "status" "CommercialRecommendationStatus" NOT NULL DEFAULT 'OPEN',
  "method" "RecommendationMethod" NOT NULL DEFAULT 'DETERMINISTIC_RULE',
  "ruleVersion" TEXT NOT NULL DEFAULT '7a.v1',
  "triggerKey" TEXT NOT NULL UNIQUE,
  "triggerType" TEXT NOT NULL,
  "campaignId" UUID REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "bookingId" UUID,
  "bookingItemId" UUID,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "inputSnapshotJson" JSONB NOT NULL DEFAULT '{}',
  "suggestionsJson" JSONB NOT NULL DEFAULT '[]',
  "explanation" TEXT,
  "freshnessLabel" TEXT NOT NULL DEFAULT 'fresh',
  "pricingAvailable" BOOLEAN NOT NULL DEFAULT true,
  "costDataComplete" BOOLEAN NOT NULL DEFAULT false,
  "marginSuppressed" BOOLEAN NOT NULL DEFAULT false,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" UUID,
  "appliedChangeJson" JSONB NOT NULL DEFAULT '{}',
  "actionHistoryJson" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CommercialRecommendation_tenantOrganizationId_status_idx" ON "CommercialRecommendation"("tenantOrganizationId","status");
CREATE INDEX IF NOT EXISTS "CommercialRecommendation_campaignId_status_idx" ON "CommercialRecommendation"("campaignId","status");
CREATE INDEX IF NOT EXISTS "CommercialRecommendation_kind_status_expiresAt_idx" ON "CommercialRecommendation"("kind","status","expiresAt");
CREATE INDEX IF NOT EXISTS "CommercialRecommendation_bookingId_idx" ON "CommercialRecommendation"("bookingId");
