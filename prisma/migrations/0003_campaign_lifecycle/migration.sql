-- Campaign operational lifecycle for request → booked → active flow
CREATE TYPE "CampaignLifecycleStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED'
);

ALTER TABLE "Campaign"
  ADD COLUMN "lifecycleStatus" "CampaignLifecycleStatus" NOT NULL DEFAULT 'DRAFT';

CREATE INDEX "Campaign_lifecycleStatus_startDate_endDate_idx"
  ON "Campaign" ("lifecycleStatus", "startDate", "endDate");
