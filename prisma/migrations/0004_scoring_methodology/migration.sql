-- AlterTable
ALTER TABLE "ScoringConfig" ADD COLUMN IF NOT EXISTS "methodologyJson" JSONB;
