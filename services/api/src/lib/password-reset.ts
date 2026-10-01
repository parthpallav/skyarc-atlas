import { createHash, randomBytes } from "node:crypto";
import type { Env } from "@skyarc/config";
import { DEFAULT_PRODUCTION_WEB_APP_URL, parseCorsOrigins } from "@skyarc/config";
import { prisma } from "./prisma.js";

export const PASSWORD_RESET_DEVICE_LABEL = "__password_reset__";
export const PASSWORD_RESET_DAYS = 7;

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** API hostnames must never be used for browser reset links. */
export function isLikelyApiOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.port === "3001" || u.port === "3002") return true;
    if (u.pathname.startsWith("/api")) return true;
    return false;
  } catch {
    return true;
  }
}

export function resolveWebAppOrigin(env: Env, requestOrigin?: string | null): string {
  if (env.WEB_APP_URL) return env.WEB_APP_URL.replace(/\/$/, "");
  if (requestOrigin && !isLikelyApiOrigin(requestOrigin)) {
    const allowed = parseCorsOrigins(env.CORS_ORIGINS);
    if (allowed.includes("*") || allowed.includes(requestOrigin)) {
      return requestOrigin.replace(/\/$/, "");
    }
  }
  const first = parseCorsOrigins(env.CORS_ORIGINS).find(
    (o) => o !== "*" && !o.includes("*") && !isLikelyApiOrigin(o)
  );
  const fallback =
    env.NODE_ENV === "production"
      ? DEFAULT_PRODUCTION_WEB_APP_URL
      : "http://localhost:3000";
  return (first ?? fallback).replace(/\/$/, "");
}

export async function issuePasswordResetToken(userId: string): Promise<{
  rawToken: string;
  expiresAt: Date;
}> {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      deviceLabel: PASSWORD_RESET_DEVICE_LABEL,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashPasswordResetToken(rawToken),
      deviceLabel: PASSWORD_RESET_DEVICE_LABEL,
      expiresAt,
    },
  });
  return { rawToken, expiresAt };
}

export function buildPasswordResetLink(origin: string, rawToken: string): string {
  return `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;
}
