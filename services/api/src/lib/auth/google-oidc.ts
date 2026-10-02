/**
 * Google OpenID Connect helpers.
 * Production callback must use server-side code exchange + ID token validation.
 * Live Google verification remains pending until credentials are configured and tested.
 */
import { createHash, createPublicKey, randomBytes, createVerify } from "node:crypto";
import { UserRole } from "@skyarc/shared";

export const GOOGLE_OIDC_ISSUER = "https://accounts.google.com";
export const GOOGLE_OIDC_PROVIDER = "google";
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

export type GoogleIdTokenClaims = {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nonce?: string;
};

export type GoogleOidcConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function googleOidcConfigured(input: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
}): GoogleOidcConfig | null {
  if (!input.GOOGLE_CLIENT_ID || !input.GOOGLE_CLIENT_SECRET || !input.GOOGLE_REDIRECT_URI) {
    return null;
  }
  return {
    clientId: input.GOOGLE_CLIENT_ID,
    clientSecret: input.GOOGLE_CLIENT_SECRET,
    redirectUri: input.GOOGLE_REDIRECT_URI,
  };
}

export function hashOAuthState(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Minimal initial role for self-serve Google sign-up without invitation. */
export const GOOGLE_SELF_SERVE_ROLE = UserRole.CLIENT_VIEWER;

export function assertGoogleClaims(
  claims: GoogleIdTokenClaims,
  expectedClientId: string,
  opts?: { expectedNonce?: string; nowMs?: number }
): { ok: true } | { ok: false; reason: string } {
  if (!claims.sub || typeof claims.sub !== "string") {
    return { ok: false, reason: "Missing stable subject" };
  }
  const issOk =
    !claims.iss ||
    claims.iss === GOOGLE_OIDC_ISSUER ||
    claims.iss === "accounts.google.com" ||
    claims.iss === "https://accounts.google.com";
  if (!issOk) return { ok: false, reason: "Unexpected issuer" };

  const aud = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!aud.includes(expectedClientId)) {
    return { ok: false, reason: "Audience mismatch" };
  }
  const now = Math.floor((opts?.nowMs ?? Date.now()) / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    return { ok: false, reason: "ID token expired" };
  }
  if (opts?.expectedNonce && claims.nonce && claims.nonce !== opts.expectedNonce) {
    return { ok: false, reason: "Nonce mismatch" };
  }
  return { ok: true };
}

export type GoogleTokenVerifier = (input: {
  code: string;
  config: GoogleOidcConfig;
  expectedNonce?: string;
}) => Promise<GoogleIdTokenClaims>;

function b64urlJson(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/**
 * Exchange authorization code and validate ID token signature via Google JWKS.
 * Uses maintained fetch + crypto (openid-client optional when installed).
 */
export async function verifyGoogleAuthorizationCode(input: {
  code: string;
  config: GoogleOidcConfig;
  expectedNonce?: string;
  fetchImpl?: typeof fetch;
}): Promise<GoogleIdTokenClaims> {
  const fetchFn = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    redirect_uri: input.config.redirectUri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetchFn(GOOGLE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as { id_token?: string };
  if (!tokenJson.id_token) throw new Error("Google token response missing id_token");

  const [h, p, s] = tokenJson.id_token.split(".");
  if (!h || !p || !s) throw new Error("Malformed Google id_token");
  const header = b64urlJson(h) as { kid?: string; alg?: string };
  const payload = b64urlJson(p) as GoogleIdTokenClaims;

  const jwksRes = await fetchFn(GOOGLE_JWKS_URI);
  if (!jwksRes.ok) throw new Error("Failed to fetch Google JWKS");
  const jwks = (await jwksRes.json()) as {
    keys: Array<{ kid?: string; kty: string; n: string; e: string; alg?: string }>;
  };
  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error("Google JWKS key not found for token");

  const pub = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: "jwk" });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  const sigOk = verifier.verify(pub, Buffer.from(s, "base64url"));
  if (!sigOk) throw new Error("Google ID token signature invalid");

  const check = assertGoogleClaims(payload, input.config.clientId, {
    expectedNonce: input.expectedNonce,
  });
  if (!check.ok) throw new Error(check.reason);
  return payload;
}

export function buildGoogleAuthorizeUrl(input: {
  config: GoogleOidcConfig;
  state: string;
  nonce: string;
  loginHint?: string;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", input.config.clientId);
  u.searchParams.set("redirect_uri", input.config.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", input.state);
  u.searchParams.set("nonce", input.nonce);
  u.searchParams.set("access_type", "online");
  u.searchParams.set("prompt", "select_account");
  if (input.loginHint) u.searchParams.set("login_hint", input.loginHint);
  return u.toString();
}
