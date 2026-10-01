-- Audit log for admin window-scoped availability releases
CREATE TABLE IF NOT EXISTS "LocationAvailabilityRelease" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorUserId" UUID NOT NULL,
  "locationIds" JSONB NOT NULL,
  "fromDate" DATE NOT NULL,
  "toDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "affectedJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocationAvailabilityRelease_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LocationAvailabilityRelease_actorUserId_idx"
  ON "LocationAvailabilityRelease"("actorUserId");
CREATE INDEX IF NOT EXISTS "LocationAvailabilityRelease_createdAt_idx"
  ON "LocationAvailabilityRelease"("createdAt");
