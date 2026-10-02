import { describe, expect, it } from "vitest";
import {
  assertGoogleClaims,
  buildGoogleAuthorizeUrl,
  googleOidcConfigured,
  GOOGLE_SELF_SERVE_ROLE,
  hashInviteToken,
  newInviteToken,
} from "../lib/auth/google-oidc.js";
import { UserRole } from "@skyarc/shared";

describe("google oidc helpers", () => {
  it("requires all three config values", () => {
    expect(googleOidcConfigured({})).toBeNull();
    expect(
      googleOidcConfigured({
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret-value",
        GOOGLE_REDIRECT_URI: "http://localhost:3000/auth/google/callback",
      })
    ).toMatchObject({ clientId: "client" });
  });

  it("validates claims audience, issuer, expiry, nonce", () => {
    const ok = assertGoogleClaims(
      {
        sub: "stable-subject-1",
        aud: "client",
        iss: "https://accounts.google.com",
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: "n1",
      },
      "client",
      { expectedNonce: "n1" }
    );
    expect(ok).toEqual({ ok: true });

    expect(
      assertGoogleClaims({ sub: "s", aud: "other", exp: 9999999999 }, "client").ok
    ).toBe(false);
    expect(
      assertGoogleClaims(
        { sub: "s", aud: "client", exp: 1 },
        "client",
        { nowMs: 10_000 }
      ).ok
    ).toBe(false);
  });

  it("builds authorize URL without embedding secrets", () => {
    const url = buildGoogleAuthorizeUrl({
      config: {
        clientId: "client",
        clientSecret: "sekret",
        redirectUri: "http://localhost/cb",
      },
      state: "st",
      nonce: "nn",
    });
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=client");
    expect(url).not.toContain("sekret");
  });

  it("uses minimal self-serve role and hashes invite tokens", () => {
    expect(GOOGLE_SELF_SERVE_ROLE).toBe(UserRole.CLIENT_VIEWER);
    const t = newInviteToken();
    expect(hashInviteToken(t)).toHaveLength(64);
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
  });
});
