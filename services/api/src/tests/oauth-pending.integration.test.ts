/**
 * OAuth pending state — shared Postgres store, atomic consume, browser session bind.
 */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createIntegrationPrisma, describeIntegration } from "./helpers/integration-db.js";
import {
  consumeOAuthPending,
  newBrowserSessionId,
  putOAuthPending,
} from "../lib/auth/oauth-pending-store.js";
import { newOAuthState, newPkceVerifier } from "../lib/auth/google-oidc.js";

describeIntegration("oauth pending shared store", () => {
  const prisma = createIntegrationPrisma();
  const secret = "integration-oauth-secret-min-32-chars!!";

  it("consumes state once and rejects wrong browser session / restart-safe", async () => {
    const state = newOAuthState();
    const browserSessionId = newBrowserSessionId();
    await putOAuthPending(prisma, {
      state,
      encryptionSecret: secret,
      payload: {
        nonce: newOAuthState(),
        codeVerifier: newPkceVerifier(),
        mode: "login",
        browserSessionId,
        action: "google_login",
      },
    });

    const wrongSession = await consumeOAuthPending(prisma, {
      state,
      browserSessionId: newBrowserSessionId(),
      encryptionSecret: secret,
    });
    expect(wrongSession).toBeNull();

    // Wrong session must not consume — row still available
    const first = await consumeOAuthPending(prisma, {
      state,
      browserSessionId,
      encryptionSecret: secret,
      expectedMode: "login",
    });
    expect(first?.codeVerifier).toBeTruthy();

    const second = await consumeOAuthPending(prisma, {
      state,
      browserSessionId,
      encryptionSecret: secret,
    });
    expect(second).toBeNull();

    await prisma.oAuthPendingState.deleteMany({});
  });
});
