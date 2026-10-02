-- Shared Google OIDC pending state (multi-instance safe). Encrypted blob holds nonce + PKCE verifier.
CREATE TABLE IF NOT EXISTS "OAuthPendingState" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "stateHash" TEXT NOT NULL UNIQUE,
  "browserSessionHash" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "userId" UUID,
  "encryptedBlob" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OAuthPendingState_expiresAt_idx" ON "OAuthPendingState"("expiresAt");
CREATE INDEX IF NOT EXISTS "OAuthPendingState_browserSessionHash_idx" ON "OAuthPendingState"("browserSessionHash");
