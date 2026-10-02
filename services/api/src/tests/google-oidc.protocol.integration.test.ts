/**
 * Controlled OIDC protocol integration (not live Google).
 * Verifies state/nonce/PKCE/issuer/audience/expiry/subject linking against a local RSA JWKS provider.
 * Requires INTEGRATION_DATABASE_URL for account persistence checks.
 */
import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  createIntegrationPrisma,
  describeIntegration,
} from "./helpers/integration-db.js";
import {
  assertGoogleClaims,
  buildGoogleAuthorizeUrl,
  googleOidcConfigured,
  newPkceVerifier,
  pkceChallengeS256,
  verifyGoogleAuthorizationCode,
  GOOGLE_OIDC_PROVIDER,
} from "../lib/auth/google-oidc.js";
import {
  createOrganizationInvitation,
  linkGoogleToAuthenticatedUser,
  upsertGoogleSignIn,
} from "../lib/auth/google-identity.js";
import { UserRole } from "@skyarc/shared";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

describeIntegration("google OIDC protocol (controlled provider)", () => {
  const prisma = createIntegrationPrisma();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as { kty: string; n: string; e: string };
  const kid = "test-kid-1";
  const issuer = "https://oidc.test.local";
  const clientId = "test-client";
  const clientSecret = "test-secret-value";
  const redirectUri = "http://localhost:3000/auth/google/callback";
  const config = { clientId, clientSecret, redirectUri };

  function signIdToken(claims: Record<string, unknown>): string {
    const header = b64url({ alg: "RS256", typ: "JWT", kid });
    const payload = b64url(claims);
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const sig = signer.sign(privateKey).toString("base64url");
    return `${header}.${payload}.${sig}`;
  }

  function fetchImplFactory(opts: {
    expectedVerifier?: string;
    idToken: string;
    failPkce?: boolean;
  }) {
    return async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/token")) {
        const body = String(init?.body ?? "");
        const params = new URLSearchParams(body);
        if (opts.expectedVerifier) {
          const ok = params.get("code_verifier") === opts.expectedVerifier;
          if (!ok || opts.failPkce) {
            return new Response("invalid_grant", { status: 400 });
          }
        }
        return new Response(JSON.stringify({ id_token: opts.idToken }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/jwks")) {
        return new Response(
          JSON.stringify({ keys: [{ kid, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("not found", { status: 404 });
    };
  }

  it("validates PKCE, nonce, audience, expiry and persists stable subject", async () => {
    const tag = `goidc-${randomUUID().slice(0, 8)}`;
    const sub = `sub-${tag}`;
    const email = `${tag}@oidc.test`;
    const nonce = "nonce-abc";
    const verifier = newPkceVerifier();
    const challenge = pkceChallengeS256(verifier);
    const authUrl = buildGoogleAuthorizeUrl({
      config,
      state: "st",
      nonce,
      codeChallenge: challenge,
    });
    expect(authUrl).toContain("code_challenge=");
    expect(authUrl).toContain("code_challenge_method=S256");

    const idToken = signIdToken({
      sub,
      email,
      email_verified: true,
      name: "OIDC Tester",
      iss: issuer,
      aud: clientId,
      nonce,
      exp: Math.floor(Date.now() / 1000) + 600,
      iat: Math.floor(Date.now() / 1000),
    });

    const claims = await verifyGoogleAuthorizationCode({
      code: "auth-code",
      config,
      expectedNonce: nonce,
      codeVerifier: verifier,
      fetchImpl: fetchImplFactory({ expectedVerifier: verifier, idToken }) as typeof fetch,
      tokenUri: "https://oidc.test.local/token",
      jwksUri: "https://oidc.test.local/jwks",
      allowedIssuers: [issuer],
    });
    expect(claims.sub).toBe(sub);

    // Bad PKCE rejected
    await expect(
      verifyGoogleAuthorizationCode({
        code: "auth-code",
        config,
        codeVerifier: "wrong",
        fetchImpl: fetchImplFactory({
          expectedVerifier: verifier,
          idToken,
          failPkce: true,
        }) as typeof fetch,
        tokenUri: "https://oidc.test.local/token",
        jwksUri: "https://oidc.test.local/jwks",
        allowedIssuers: [issuer],
      })
    ).rejects.toThrow(/token exchange failed/i);

    // Expired claims rejected by assertGoogleClaims
    expect(
      assertGoogleClaims(
        { sub, aud: clientId, iss: "https://accounts.google.com", exp: 1 },
        clientId,
        { nowMs: 10_000 }
      ).ok
    ).toBe(false);

    const signedIn = await upsertGoogleSignIn(prisma, {
      claims: { ...claims, iss: "https://accounts.google.com" },
      config: googleOidcConfigured({
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: clientSecret,
        GOOGLE_REDIRECT_URI: redirectUri,
      })!,
    });
    expect("error" in signedIn).toBe(false);
    if ("error" in signedIn) return;
    expect(signedIn.user.email).toBe(email);
    expect(signedIn.user.organizationId).toBeNull();
    expect(signedIn.user.role).toBe(UserRole.CLIENT_VIEWER);

    const identity = await prisma.externalIdentity.findUnique({
      where: { provider_subject: { provider: GOOGLE_OIDC_PROVIDER, subject: sub } },
    });
    expect(identity?.userId).toBe(signedIn.user.id);

    // Authenticated link path: create second password user and require link
    const passwordUser = await prisma.user.create({
      data: {
        email: `${tag}-pwd@oidc.test`,
        passwordHash: "hash",
        name: "Pwd",
        role: UserRole.MEDIA_PLANNER,
      },
    });
    const linkOther = await linkGoogleToAuthenticatedUser(prisma, {
      userId: passwordUser.id,
      claims: { ...claims, email: passwordUser.email },
      config,
    });
    // subject already linked to first user
    expect("error" in linkOther).toBe(true);

    // Invitation joins org without auto SaaS per advertiser
    const staff = await prisma.user.create({
      data: {
        email: `${tag}-staff@oidc.test`,
        passwordHash: "hash",
        name: "Staff",
        role: UserRole.ADMIN,
      },
    });
    const org = await prisma.organization.create({
      data: { name: `${tag}-client-org`, type: "CLIENT", status: "ACTIVE" },
    });
    const invite = await createOrganizationInvitation(prisma, {
      email: `${tag}-invitee@oidc.test`,
      role: UserRole.CLIENT_VIEWER,
      organizationId: org.id,
      invitedByUserId: staff.id,
    });
    expect("error" in invite).toBe(false);
    if ("error" in invite) return;

    const inviteClaims = {
      sub: `sub-invite-${tag}`,
      email: `${tag}-invitee@oidc.test`,
      email_verified: true,
      iss: "https://accounts.google.com",
      aud: clientId,
      exp: Math.floor(Date.now() / 1000) + 600,
    };
    const invited = await upsertGoogleSignIn(prisma, {
      claims: inviteClaims,
      config,
      inviteToken: invite.token,
    });
    expect("error" in invited).toBe(false);
    if ("error" in invited) return;
    expect(invited.user.organizationId).toBe(org.id);

    // Logout revocation: refresh tokens marked revoked
    const { createHash, randomBytes } = await import("node:crypto");
    const refreshRaw = randomBytes(48).toString("hex");
    const tokenHash = createHash("sha256").update(refreshRaw).digest("hex");
    await prisma.refreshToken.create({
      data: {
        userId: signedIn.user.id,
        tokenHash,
        deviceLabel: "google-oidc-test",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: signedIn.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const revoked = await prisma.refreshToken.findFirst({ where: { tokenHash } });
    expect(revoked?.revokedAt).toBeTruthy();

    // Disabled user rejected
    await prisma.user.update({
      where: { id: signedIn.user.id },
      data: { deactivatedAt: new Date() },
    });
    const disabled = await upsertGoogleSignIn(prisma, {
      claims: { ...claims, iss: "https://accounts.google.com" },
      config,
    });
    expect("error" in disabled && disabled.error).toMatch(/disabled/i);

    // Cleanup
    await prisma.externalIdentity.deleteMany({
      where: { userId: { in: [signedIn.user.id, invited.user.id] } },
    });
    await prisma.organizationInvitation.deleteMany({ where: { invitedByUserId: staff.id } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [signedIn.user.id, passwordUser.id, staff.id, invited.user.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [signedIn.user.id, passwordUser.id, staff.id, invited.user.id] } },
    });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});
