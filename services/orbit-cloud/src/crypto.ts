import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function credentialsMatch(secret: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  return safeEqualHex(hashSecret(secret), hash);
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
