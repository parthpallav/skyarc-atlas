-- Phase 6: WhatsApp account linking + mutation confirmations (Atlas)
DO $$ BEGIN CREATE TYPE "WhatsAppConfirmAction" AS ENUM ('RESERVE_INVENTORY','ACCEPT_QUOTE','AMEND_BOOKING','CANCEL_BOOKING','VENDOR_APPROVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "WhatsAppAccountLink" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tenantOrganizationId" UUID NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WhatsAppAccountLink_phoneE164_revokedAt_idx" ON "WhatsAppAccountLink"("phoneE164","revokedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppAccountLink_userId_revokedAt_idx" ON "WhatsAppAccountLink"("userId","revokedAt");

CREATE TABLE IF NOT EXISTS "WhatsAppLinkChallenge" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tenantOrganizationId" UUID NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WhatsAppLinkChallenge_userId_expiresAt_idx" ON "WhatsAppLinkChallenge"("userId","expiresAt");

CREATE TABLE IF NOT EXISTS "WhatsAppActionConfirmation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tenantOrganizationId" UUID,
  "action" "WhatsAppConfirmAction" NOT NULL,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "fingerprint" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WhatsAppActionConfirmation_userId_expiresAt_idx" ON "WhatsAppActionConfirmation"("userId","expiresAt");
CREATE INDEX IF NOT EXISTS "WhatsAppActionConfirmation_fingerprint_idx" ON "WhatsAppActionConfirmation"("fingerprint");
