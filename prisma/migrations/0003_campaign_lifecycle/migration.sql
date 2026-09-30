-- Campaign operational lifecycle for request → booked → active flow
DO $$ BEGIN
  CREATE TYPE "CampaignLifecycleStatus" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'ACTIVE',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "lifecycleStatus" "CampaignLifecycleStatus" NOT NULL DEFAULT 'DRAFT';

CREATE INDEX IF NOT EXISTS "Campaign_lifecycleStatus_startDate_endDate_idx"
  ON "Campaign" ("lifecycleStatus", "startDate", "endDate");
