/**
 * Shared, expiring Google OIDC pending-state store (Postgres).
 * Survives multi-instance restarts. Verifiers are encrypted at rest; never log plaintext.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashOAuthState } from "./google-oidc.js";

const TTL_MS = 10 * 60_000;
const ALG = "aes-256-gcm";

export type OAuthPendingMode = "login" | "link";

export type OAuthPendingPayload = {
  nonce: string;
  codeVerifier: string;
  mode: OAuthPendingMode;
  inviteToken?: string;
  /** Authenticated user for link mode */
  userId?: string;
  /** Browser session id (raw) — hashed for storage/compare */
  browserSessionId: string;
  action: "google_login" | "google_link";
};

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`oauth-pending:${secret}`).digest();
}

export function encryptOAuthPending(secret: string, payload: OAuthPendingPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptOAuthPending(secret: string, blob: string): OAuthPendingPayload {
  const [ivB, tagB, dataB] = blob.split(".");
  if (!ivB || !tagB || !dataB) throw new Error("Malformed OAuth pending blob");
  const decipher = createDecipheriv(ALG, deriveKey(secret), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plain) as OAuthPendingPayload;
}

/** Redacted view safe for logs/metrics. */
export function redactOAuthPending(row: {
  stateHash: string;
  mode: string;
  expiresAt: Date;
  consumedAt: Date | null;
}): Record<string, unknown> {
  return {
    stateHashPrefix: row.stateHash.slice(0, 8),
    mode: row.mode,
    expiresAt: row.expiresAt.toISOString(),
    consumed: Boolean(row.consumedAt),
  };
}

export function newBrowserSessionId(): string {
  return randomBytes(24).toString("base64url");
}

export function hashBrowserSession(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function putOAuthPending(
  db: PrismaClient,
  input: {
    state: string;
    encryptionSecret: string;
    payload: OAuthPendingPayload;
    ttlMs?: number;
  }
) {
  const stateHash = hashOAuthState(input.state);
  const browserSessionHash = hashBrowserSession(input.payload.browserSessionId);
  const encryptedBlob = encryptOAuthPending(input.encryptionSecret, input.payload);
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? TTL_MS));
  await db.oAuthPendingState.create({
    data: {
      stateHash,
      browserSessionHash,
      mode: input.payload.mode,
      userId: input.payload.userId ?? null,
      encryptedBlob,
      expiresAt,
    },
  });
  return { stateHash, expiresAt, expiresInSeconds: Math.floor((input.ttlMs ?? TTL_MS) / 1000) };
}

/**
 * Atomically consume pending state once. Returns null if missing, expired, already used,
 * or browser session mismatch. Session is checked in the same UPDATE predicate so a wrong
 * session cannot burn a valid pending row.
 */
export async function consumeOAuthPending(
  db: PrismaClient,
  input: {
    state: string;
    browserSessionId: string | null | undefined;
    encryptionSecret: string;
    expectedMode?: OAuthPendingMode;
    expectedUserId?: string;
  }
): Promise<OAuthPendingPayload | null> {
  if (!input.browserSessionId) return null;
  const stateHash = hashOAuthState(input.state);
  const browserSessionHash = hashBrowserSession(input.browserSessionId);
  const now = new Date();
  const updated = await db.oAuthPendingState.updateMany({
    where: {
      stateHash,
      browserSessionHash,
      consumedAt: null,
      expiresAt: { gt: now },
      ...(input.expectedMode ? { mode: input.expectedMode } : {}),
      ...(input.expectedUserId ? { userId: input.expectedUserId } : {}),
    },
    data: { consumedAt: now },
  });
  if (updated.count !== 1) return null;

  const row = await db.oAuthPendingState.findUnique({ where: { stateHash } });
  if (!row || !row.consumedAt) return null;

  let payload: OAuthPendingPayload;
  try {
    payload = decryptOAuthPending(input.encryptionSecret, row.encryptedBlob);
  } catch {
    return null;
  }

  if (input.expectedMode && payload.mode !== input.expectedMode) return null;
  if (input.expectedUserId && payload.userId !== input.expectedUserId) return null;
  return payload;
}

export async function purgeExpiredOAuthPending(db: PrismaClient) {
  await db.oAuthPendingState.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }],
    },
  });
}

export const OAUTH_BROWSER_COOKIE = "skyarc_oauth_sid";
export const OAUTH_PENDING_TTL_MS = TTL_MS;
