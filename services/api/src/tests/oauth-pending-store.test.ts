import { describe, expect, it } from "vitest";
import {
  encryptOAuthPending,
  decryptOAuthPending,
  hashBrowserSession,
  newBrowserSessionId,
  redactOAuthPending,
} from "../lib/auth/oauth-pending-store.js";

describe("oauth pending store crypto", () => {
  it("round-trips encrypted pending payload and redacts logs", () => {
    const secret = "x".repeat(32);
    const browserSessionId = newBrowserSessionId();
    const blob = encryptOAuthPending(secret, {
      nonce: "nonce-1",
      codeVerifier: "verifier-secret-value",
      mode: "login",
      browserSessionId,
      action: "google_login",
    });
    expect(blob).not.toContain("verifier-secret-value");
    const decoded = decryptOAuthPending(secret, blob);
    expect(decoded.codeVerifier).toBe("verifier-secret-value");
    expect(decoded.nonce).toBe("nonce-1");
    expect(hashBrowserSession(browserSessionId)).toHaveLength(64);

    const redacted = redactOAuthPending({
      stateHash: "abcdef0123456789",
      mode: "login",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      consumedAt: null,
    });
    expect(JSON.stringify(redacted)).not.toContain("verifier");
    expect(redacted.stateHashPrefix).toBe("abcdef01");
  });

  it("rejects tampered ciphertext", () => {
    const secret = "y".repeat(32);
    const blob = encryptOAuthPending(secret, {
      nonce: "n",
      codeVerifier: "v",
      mode: "link",
      browserSessionId: "sid",
      action: "google_link",
      userId: "11111111-1111-4111-8111-111111111111",
    });
    const parts = blob.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptOAuthPending(secret, parts.join("."))).toThrow();
  });
});
