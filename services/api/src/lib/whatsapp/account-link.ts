/**
 * WhatsApp account linking — phone alone never grants Atlas access.
 * Authenticated user initiates; single-use expiring challenge binds verified channel identity.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient;

export function hashLinkToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function normalizeE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? digits : digits;
}

export async function createWhatsAppLinkChallenge(
  db: Db,
  input: {
    userId: string;
    tenantOrganizationId: string;
    phoneE164: string;
    actorUserId: string;
    ttlMinutes?: number;
  }
) {
  if (input.userId !== input.actorUserId) {
    // Only self-link unless we add admin path later — prevent linking others' accounts silently
    return { error: "Link challenges must be initiated by the target user" as const };
  }
  if (!input.tenantOrganizationId) {
    return { error: "Tenant organization required — ambiguous tenant selection is not allowed" as const };
  }

  const phone = normalizeE164(input.phoneE164);
  if (phone.length < 10) return { error: "Invalid phone number" as const };

  const existing = await db.whatsAppAccountLink.findFirst({
    where: { phoneE164: phone, revokedAt: null },
  });
  if (existing && existing.userId !== input.userId) {
    return { error: "Phone number is already linked to another account" as const };
  }

  const raw = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + (input.ttlMinutes ?? 30) * 60_000);
  await db.whatsAppLinkChallenge.updateMany({
    where: { userId: input.userId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() }, // invalidate prior unused
  });

  const challenge = await db.whatsAppLinkChallenge.create({
    data: {
      userId: input.userId,
      tenantOrganizationId: input.tenantOrganizationId,
      phoneE164: phone,
      tokenHash: hashLinkToken(raw),
      expiresAt,
    },
  });

  return {
    challengeId: challenge.id,
    token: raw,
    expiresAt,
    phoneE164: phone,
    note: "Single-use. Complete verification from the WhatsApp channel; phone alone does not grant access.",
  };
}

export async function completeWhatsAppLink(
  db: Db,
  input: { token: string; verifiedPhoneE164: string }
) {
  const tokenHash = hashLinkToken(input.token);
  const challenge = await db.whatsAppLinkChallenge.findFirst({ where: { tokenHash } });
  if (!challenge) return { error: "Link challenge not found" as const };
  if (challenge.usedAt) return { error: "Link challenge already used" as const };
  if (challenge.expiresAt.getTime() < Date.now()) return { error: "Link challenge expired" as const };

  const phone = normalizeE164(input.verifiedPhoneE164);
  if (phone !== challenge.phoneE164) {
    return { error: "Verified phone does not match challenge" as const };
  }

  await db.whatsAppLinkChallenge.update({
    where: { id: challenge.id },
    data: { usedAt: new Date() },
  });

  // Revoke other active links for this user/tenant ambiguity
  await db.whatsAppAccountLink.updateMany({
    where: {
      OR: [
        { userId: challenge.userId, revokedAt: null },
        { phoneE164: phone, revokedAt: null },
      ],
    },
    data: { revokedAt: new Date() },
  });

  const link = await db.whatsAppAccountLink.create({
    data: {
      userId: challenge.userId,
      tenantOrganizationId: challenge.tenantOrganizationId,
      phoneE164: phone,
      verifiedAt: new Date(),
    },
  });

  return { link };
}

export async function revokeWhatsAppLink(db: Db, linkId: string, actorUserId: string) {
  const link = await db.whatsAppAccountLink.findUnique({ where: { id: linkId } });
  if (!link || link.revokedAt) return { error: "Link not found" as const };
  if (link.userId !== actorUserId) return { error: "Not authorized to unlink" as const };
  const updated = await db.whatsAppAccountLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });
  return { link: updated };
}

export async function resolveLinkedUser(db: Db, phoneE164: string) {
  const phone = normalizeE164(phoneE164);
  const links = await db.whatsAppAccountLink.findMany({
    where: { phoneE164: phone, revokedAt: null },
  });
  if (links.length === 0) return { error: "No linked Atlas account for this phone" as const };
  if (links.length > 1) {
    return { error: "Ambiguous account/tenant binding — contact support to resolve" as const };
  }
  return { link: links[0]! };
}
