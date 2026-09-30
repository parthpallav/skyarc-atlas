CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Orbit foundation: public screen codes + device references (additive)
ALTER TABLE "Screen" ADD COLUMN IF NOT EXISTS "skyarcScreenCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Screen_skyarcScreenCode_key" ON "Screen"("skyarcScreenCode");

CREATE TABLE IF NOT EXISTS "ScreenExternalId" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "screenId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "idType" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScreenExternalId_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScreenExternalId_provider_idType_externalId_key"
  ON "ScreenExternalId"("provider", "idType", "externalId");
CREATE INDEX IF NOT EXISTS "ScreenExternalId_screenId_provider_idx"
  ON "ScreenExternalId"("screenId", "provider");
DO $$ BEGIN
  ALTER TABLE "ScreenExternalId"
    ADD CONSTRAINT "ScreenExternalId_screenId_fkey"
    FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Device" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "screenId" UUID NOT NULL,
  "organizationId" UUID,
  "provider" TEXT NOT NULL,
  "deviceType" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "summaryJson" JSONB NOT NULL DEFAULT '{}',
  "lastEventAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Device_provider_externalId_key" ON "Device"("provider", "externalId");
CREATE INDEX IF NOT EXISTS "Device_screenId_idx" ON "Device"("screenId");
DO $$ BEGIN
  ALTER TABLE "Device"
    ADD CONSTRAINT "Device_screenId_fkey"
    FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OrbitEventReceipt" (
  "eventId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrbitEventReceipt_pkey" PRIMARY KEY ("eventId")
);
