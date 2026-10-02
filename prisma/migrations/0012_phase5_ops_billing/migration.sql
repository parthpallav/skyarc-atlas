-- Phase 5: campaign ops, creative, proof, billing, vendor costs, reminders, accounting export

DO $$ BEGIN CREATE TYPE "ExecutionTaskKind" AS ENUM ('CREATIVE_SUBMISSION','CREATIVE_APPROVAL','PRODUCTION','MOUNTING','CONTENT_UPLOAD','LAUNCH_VERIFICATION','MONITORING','ISSUE_RESOLUTION','REMOVAL','CLOSURE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ExecutionTaskStatus" AS ENUM ('PENDING','READY','IN_PROGRESS','BLOCKED','DONE','SKIPPED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CreativeVersionStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','REJECTED','SUPERSEDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CreativeCmsHandoffStatus" AS ENUM ('NOT_REQUIRED','MANUAL_PENDING','MANUAL_SENT','CONFIRMED_EXTERNAL','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProofKind" AS ENUM ('PRE_MOUNT','LIVE_ON_SITE','MID_FLIGHT','POST_REMOVAL','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProofReviewStatus" AS ENUM ('PENDING_REVIEW','APPROVED','REJECTED','REPLACED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoiceLineKind" AS ENUM ('MEDIA','PRODUCTION','TAX','ADJUSTMENT','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoicePaymentMethod" AS ENUM ('MANUAL','PROVIDER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "InvoicePaymentStatus" AS ENUM ('RECORDED','RECONCILED','VOID','UNAVAILABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT','ISSUED','APPLIED','VOID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VendorPoStatus" AS ENUM ('DRAFT','APPROVED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VendorBillStatus" AS ENUM ('DRAFT','APPROVED','PAID','VOID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CampaignExpenseStatus" AS ENUM ('EXPECTED','COMMITTED','INCURRED','PAID','VOID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReminderJobStatus" AS ENUM ('PENDING','CONFIGURATION_REQUIRED','QUEUED','SENT','FAILED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReminderKind" AS ENUM ('TASK_DEADLINE','MISSING_PROOF','OVERDUE_INVOICE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AccountingExportKind" AS ENUM ('FILE_EXPORT','LIVE_SYNC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AccountingExportStatus" AS ENUM ('DRAFT','READY','EXPORTED','RECONCILED','FAILED','UNAVAILABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ExecutionTask" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "bookingId" UUID NOT NULL REFERENCES "Booking"("id") ON DELETE CASCADE,
  "bookingItemId" UUID REFERENCES "BookingItem"("id") ON DELETE SET NULL,
  "dedupeKey" TEXT NOT NULL,
  "kind" "ExecutionTaskKind" NOT NULL,
  "status" "ExecutionTaskStatus" NOT NULL DEFAULT 'PENDING',
  "templateKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "ownerUserId" UUID,
  "dueAt" TIMESTAMP(3),
  "dependsOnTaskId" UUID REFERENCES "ExecutionTask"("id") ON DELETE SET NULL,
  "checklistJson" JSONB NOT NULL DEFAULT '[]',
  "attachmentsJson" JSONB NOT NULL DEFAULT '[]',
  "blockedReason" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("bookingId", "dedupeKey")
);
CREATE INDEX IF NOT EXISTS "ExecutionTask_campaignId_status_idx" ON "ExecutionTask"("campaignId","status");
CREATE INDEX IF NOT EXISTS "ExecutionTask_bookingId_status_idx" ON "ExecutionTask"("bookingId","status");
CREATE INDEX IF NOT EXISTS "ExecutionTask_dueAt_status_idx" ON "ExecutionTask"("dueAt","status");

CREATE TABLE IF NOT EXISTS "ExecutionTaskHistory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "taskId" UUID NOT NULL REFERENCES "ExecutionTask"("id") ON DELETE CASCADE,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "actorUserId" UUID,
  "note" TEXT,
  "patchJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExecutionTaskHistory_taskId_createdAt_idx" ON "ExecutionTaskHistory"("taskId","createdAt");

CREATE TABLE IF NOT EXISTS "CreativeVersion" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "revisionNumber" INTEGER NOT NULL,
  "status" "CreativeVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "label" TEXT,
  "r2Key" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER,
  "checksumSha256" TEXT,
  "widthPx" INTEGER,
  "heightPx" INTEGER,
  "durationMs" INTEGER,
  "cmsHandoffStatus" "CreativeCmsHandoffStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "cmsHandoffNote" TEXT,
  "cmsHandoffAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "submittedByUserId" UUID,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" UUID,
  "rejectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("campaignId","revisionNumber")
);
CREATE INDEX IF NOT EXISTS "CreativeVersion_campaignId_status_idx" ON "CreativeVersion"("campaignId","status");

CREATE TABLE IF NOT EXISTS "CreativeBookingItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "creativeVersionId" UUID NOT NULL REFERENCES "CreativeVersion"("id") ON DELETE CASCADE,
  "bookingItemId" UUID NOT NULL REFERENCES "BookingItem"("id") ON DELETE CASCADE,
  UNIQUE ("creativeVersionId","bookingItemId")
);
CREATE INDEX IF NOT EXISTS "CreativeBookingItem_bookingItemId_idx" ON "CreativeBookingItem"("bookingItemId");

CREATE TABLE IF NOT EXISTS "ProofRecord" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "bookingId" UUID,
  "bookingItemId" UUID REFERENCES "BookingItem"("id") ON DELETE SET NULL,
  "locationId" UUID NOT NULL,
  "locationAssetId" UUID NOT NULL,
  "executionTaskId" UUID REFERENCES "ExecutionTask"("id") ON DELETE SET NULL,
  "kind" "ProofKind" NOT NULL DEFAULT 'LIVE_ON_SITE',
  "reviewStatus" "ProofReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "capturedAt" TIMESTAMP(3),
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "capturedLat" DOUBLE PRECISION,
  "capturedLng" DOUBLE PRECISION,
  "capturedAccuracyM" DOUBLE PRECISION,
  "submitterUserId" UUID,
  "provenanceNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" UUID,
  "rejectReason" TEXT,
  "replacesProofId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProofRecord_campaignId_reviewStatus_idx" ON "ProofRecord"("campaignId","reviewStatus");
CREATE INDEX IF NOT EXISTS "ProofRecord_bookingItemId_idx" ON "ProofRecord"("bookingItemId");
CREATE INDEX IF NOT EXISTS "ProofRecord_executionTaskId_idx" ON "ProofRecord"("executionTaskId");

CREATE TABLE IF NOT EXISTS "InvoiceNumberSequence" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID NOT NULL,
  "prefix" TEXT NOT NULL DEFAULT 'INV',
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  UNIQUE ("tenantOrganizationId","prefix")
);

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "bookingId" UUID REFERENCES "Booking"("id") ON DELETE SET NULL,
  "quoteRevisionId" UUID REFERENCES "QuoteRevision"("id") ON DELETE SET NULL,
  "invoiceNumber" TEXT UNIQUE,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "subtotalMinor" INTEGER NOT NULL,
  "taxMinor" INTEGER NOT NULL DEFAULT 0,
  "totalMinor" INTEGER NOT NULL,
  "amountPaidMinor" INTEGER NOT NULL DEFAULT 0,
  "amountCreditedMinor" INTEGER NOT NULL DEFAULT 0,
  "commercialSnapshotJson" JSONB NOT NULL DEFAULT '{}',
  "paymentTerms" TEXT,
  "dueAt" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Invoice_campaignId_status_idx" ON "Invoice"("campaignId","status");
CREATE INDEX IF NOT EXISTS "Invoice_tenantOrganizationId_status_idx" ON "Invoice"("tenantOrganizationId","status");
CREATE INDEX IF NOT EXISTS "Invoice_dueAt_status_idx" ON "Invoice"("dueAt","status");

CREATE TABLE IF NOT EXISTS "InvoiceLine" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "kind" "InvoiceLineKind" NOT NULL DEFAULT 'MEDIA',
  "description" TEXT NOT NULL,
  "inventoryId" UUID,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitMinor" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "taxMinor" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

CREATE TABLE IF NOT EXISTS "InvoicePayment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "method" "InvoicePaymentMethod" NOT NULL DEFAULT 'MANUAL',
  "status" "InvoicePaymentStatus" NOT NULL DEFAULT 'RECORDED',
  "reference" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedByUserId" UUID,
  "idempotencyKey" TEXT UNIQUE,
  "provider" TEXT,
  "providerIntentId" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_status_idx" ON "InvoicePayment"("invoiceId","status");

CREATE TABLE IF NOT EXISTS "InvoicePaymentAudit" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "paymentId" UUID NOT NULL REFERENCES "InvoicePayment"("id") ON DELETE CASCADE,
  "actorUserId" UUID,
  "action" TEXT NOT NULL,
  "detailJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InvoicePaymentAudit_paymentId_createdAt_idx" ON "InvoicePaymentAudit"("paymentId","createdAt");

CREATE TABLE IF NOT EXISTS "CreditNote" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "invoiceId" UUID NOT NULL REFERENCES "Invoice"("id") ON DELETE CASCADE,
  "creditNumber" TEXT UNIQUE,
  "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "reason" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL DEFAULT '{}',
  "issuedAt" TIMESTAMP(3),
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CreditNote_invoiceId_status_idx" ON "CreditNote"("invoiceId","status");

CREATE TABLE IF NOT EXISTS "VendorPurchaseOrder" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID,
  "vendorOrganizationId" UUID NOT NULL,
  "poNumber" TEXT,
  "status" "VendorPoStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "expectedCostMinor" INTEGER NOT NULL DEFAULT 0,
  "approvedCommitmentMinor" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VendorPurchaseOrder_campaignId_idx" ON "VendorPurchaseOrder"("campaignId");
CREATE INDEX IF NOT EXISTS "VendorPurchaseOrder_vendorOrganizationId_status_idx" ON "VendorPurchaseOrder"("vendorOrganizationId","status");

CREATE TABLE IF NOT EXISTS "VendorBill" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "purchaseOrderId" UUID REFERENCES "VendorPurchaseOrder"("id") ON DELETE SET NULL,
  "tenantOrganizationId" UUID,
  "vendorOrganizationId" UUID NOT NULL,
  "billNumber" TEXT,
  "status" "VendorBillStatus" NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "incurredMinor" INTEGER NOT NULL DEFAULT 0,
  "paidMinor" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "VendorBill_vendorOrganizationId_status_idx" ON "VendorBill"("vendorOrganizationId","status");

CREATE TABLE IF NOT EXISTS "CampaignExpense" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID NOT NULL REFERENCES "Campaign"("id") ON DELETE CASCADE,
  "purchaseOrderId" UUID REFERENCES "VendorPurchaseOrder"("id") ON DELETE SET NULL,
  "vendorBillId" UUID REFERENCES "VendorBill"("id") ON DELETE SET NULL,
  "attributionKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "status" "CampaignExpenseStatus" NOT NULL DEFAULT 'EXPECTED',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "expectedMinor" INTEGER NOT NULL DEFAULT 0,
  "committedMinor" INTEGER NOT NULL DEFAULT 0,
  "incurredMinor" INTEGER NOT NULL DEFAULT 0,
  "paidMinor" INTEGER NOT NULL DEFAULT 0,
  "costMissing" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("campaignId","attributionKey")
);
CREATE INDEX IF NOT EXISTS "CampaignExpense_campaignId_status_idx" ON "CampaignExpense"("campaignId","status");

CREATE TABLE IF NOT EXISTS "ReminderJob" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "campaignId" UUID REFERENCES "Campaign"("id") ON DELETE SET NULL,
  "kind" "ReminderKind" NOT NULL,
  "status" "ReminderJobStatus" NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "deliveryChannel" TEXT,
  "deliveryStatusNote" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ReminderJob_status_dueAt_idx" ON "ReminderJob"("status","dueAt");

CREATE TABLE IF NOT EXISTS "AccountingExportBatch" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantOrganizationId" UUID,
  "kind" "AccountingExportKind" NOT NULL DEFAULT 'FILE_EXPORT',
  "status" "AccountingExportStatus" NOT NULL DEFAULT 'DRAFT',
  "adapter" TEXT NOT NULL DEFAULT 'tally-file',
  "stableBatchKey" TEXT NOT NULL UNIQUE,
  "mappingValidationJson" JSONB NOT NULL DEFAULT '{}',
  "reconciliationStatus" TEXT NOT NULL DEFAULT 'UNRECONCILED',
  "payloadJson" JSONB NOT NULL DEFAULT '{}',
  "exportedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AccountingExportBatch_tenantOrganizationId_status_idx" ON "AccountingExportBatch"("tenantOrganizationId","status");
