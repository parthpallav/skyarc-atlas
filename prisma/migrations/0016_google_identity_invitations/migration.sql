-- Google identity + invitations (Phase product integrations)
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "ExternalIdentity" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "rawClaimsJson" JSONB NOT NULL DEFAULT '{}',
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalIdentity_provider_subject_key" UNIQUE ("provider", "subject")
);

CREATE INDEX IF NOT EXISTS "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
CREATE INDEX IF NOT EXISTS "ExternalIdentity_email_idx" ON "ExternalIdentity"("email");

CREATE TABLE IF NOT EXISTS "OrganizationInvitation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CLIENT_VIEWER',
  "organizationId" UUID,
  "createOrganization" BOOLEAN NOT NULL DEFAULT false,
  "newOrganizationName" TEXT,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "invitedByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OrganizationInvitation_email_expiresAt_idx"
  ON "OrganizationInvitation"("email", "expiresAt");
CREATE INDEX IF NOT EXISTS "OrganizationInvitation_organizationId_idx"
  ON "OrganizationInvitation"("organizationId");
