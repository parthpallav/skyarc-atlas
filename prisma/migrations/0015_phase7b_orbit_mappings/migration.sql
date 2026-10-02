-- Phase 7B: effective-dated device/screen mappings + operational risk snapshots
CREATE TABLE IF NOT EXISTS "DeviceScreenMapping" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deviceId" UUID NOT NULL REFERENCES "Device"("id") ON DELETE CASCADE,
  "screenId" UUID NOT NULL REFERENCES "Screen"("id") ON DELETE CASCADE,
  "tenantOrganizationId" UUID,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validTo" TIMESTAMP(3),
  "reason" TEXT,
  "conflictNote" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DeviceScreenMapping_deviceId_validFrom_idx" ON "DeviceScreenMapping"("deviceId","validFrom");
CREATE INDEX IF NOT EXISTS "DeviceScreenMapping_screenId_validFrom_idx" ON "DeviceScreenMapping"("screenId","validFrom");
CREATE INDEX IF NOT EXISTS "DeviceScreenMapping_tenantOrganizationId_idx" ON "DeviceScreenMapping"("tenantOrganizationId");

CREATE TABLE IF NOT EXISTS "OperationalRiskSnapshot" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'orbit_evidence',
  "snapshotJson" JSONB NOT NULL DEFAULT '{}',
  "limitationsJson" JSONB NOT NULL DEFAULT '[]',
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("campaignId","version")
);
CREATE INDEX IF NOT EXISTS "OperationalRiskSnapshot_tenantOrganizationId_createdAt_idx"
  ON "OperationalRiskSnapshot"("tenantOrganizationId","createdAt");
