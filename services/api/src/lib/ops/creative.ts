/**
 * Versioned creative assets linked to booking items.
 * CMS handoff is manual tracking only — never claims auto schedule/playback.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/pdf",
]);

const MAX_BYTES = 80 * 1024 * 1024; // 80MB

export type CreativeSpec = {
  maxBytes?: number;
  allowedTypes?: string[];
  minWidthPx?: number;
  minHeightPx?: number;
  maxDurationMs?: number;
  requireDuration?: boolean;
};

export function validateCreativeFile(
  input: {
    contentType: string;
    byteSize?: number | null;
    widthPx?: number | null;
    heightPx?: number | null;
    durationMs?: number | null;
  },
  spec: CreativeSpec = {}
): { ok: true } | { ok: false; error: string } {
  const types = new Set(spec.allowedTypes ?? [...ALLOWED_TYPES]);
  if (!types.has(input.contentType)) {
    return { ok: false, error: `Unsupported file type ${input.contentType}` };
  }
  const max = spec.maxBytes ?? MAX_BYTES;
  if (input.byteSize != null && input.byteSize > max) {
    return { ok: false, error: `File exceeds max size ${max} bytes` };
  }
  if (spec.minWidthPx && (input.widthPx == null || input.widthPx < spec.minWidthPx)) {
    return { ok: false, error: `Width below minimum ${spec.minWidthPx}px` };
  }
  if (spec.minHeightPx && (input.heightPx == null || input.heightPx < spec.minHeightPx)) {
    return { ok: false, error: `Height below minimum ${spec.minHeightPx}px` };
  }
  if (spec.requireDuration && (input.durationMs == null || input.durationMs <= 0)) {
    return { ok: false, error: "Duration required for digital creative" };
  }
  if (spec.maxDurationMs && input.durationMs != null && input.durationMs > spec.maxDurationMs) {
    return { ok: false, error: `Duration exceeds max ${spec.maxDurationMs}ms` };
  }
  return { ok: true };
}

export async function createCreativeVersion(
  db: Db,
  input: {
    campaignId: string;
    tenantOrganizationId?: string | null;
    label?: string;
    r2Key: string;
    contentType: string;
    byteSize?: number | null;
    checksumSha256?: string | null;
    widthPx?: number | null;
    heightPx?: number | null;
    durationMs?: number | null;
    bookingItemIds?: string[];
    digital?: boolean;
    actorUserId?: string | null;
  }
) {
  const check = validateCreativeFile(input, {
    requireDuration: Boolean(input.digital),
    maxDurationMs: input.digital ? 60_000 : undefined,
  });
  if (!check.ok) return { error: check.error };

  const prior = await db.creativeVersion.count({ where: { campaignId: input.campaignId } });
  const row = await db.creativeVersion.create({
    data: {
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      campaignId: input.campaignId,
      revisionNumber: prior + 1,
      status: "DRAFT",
      label: input.label ?? null,
      r2Key: input.r2Key,
      contentType: input.contentType,
      byteSize: input.byteSize ?? null,
      checksumSha256: input.checksumSha256 ?? null,
      widthPx: input.widthPx ?? null,
      heightPx: input.heightPx ?? null,
      durationMs: input.durationMs ?? null,
      cmsHandoffStatus: input.digital ? "MANUAL_PENDING" : "NOT_REQUIRED",
      bookingItems: input.bookingItemIds?.length
        ? {
            create: input.bookingItemIds.map((bookingItemId) => ({ bookingItemId })),
          }
        : undefined,
    },
    include: { bookingItems: true },
  });
  return { creative: row };
}

export async function submitCreative(db: Db, id: string, actorUserId?: string | null) {
  const c = await db.creativeVersion.findUnique({ where: { id } });
  if (!c) return { error: "Creative not found" as const };
  if (c.status !== "DRAFT" && c.status !== "REJECTED") {
    return { error: `Cannot submit from ${c.status}` as const };
  }
  const updated = await db.creativeVersion.update({
    where: { id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submittedByUserId: actorUserId ?? null,
      updatedAt: new Date(),
    },
  });
  return { creative: updated };
}

export async function approveCreative(db: Db, id: string, actorUserId?: string | null) {
  const c = await db.creativeVersion.findUnique({ where: { id } });
  if (!c) return { error: "Creative not found" as const };
  if (c.status !== "SUBMITTED") return { error: `Cannot approve from ${c.status}` as const };

  await db.creativeVersion.updateMany({
    where: { campaignId: c.campaignId, status: "APPROVED", id: { not: id } },
    data: { status: "SUPERSEDED", updatedAt: new Date() },
  });

  const updated = await db.creativeVersion.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedByUserId: actorUserId ?? null,
      rejectReason: null,
      updatedAt: new Date(),
    },
  });
  return { creative: updated };
}

export async function rejectCreative(
  db: Db,
  id: string,
  reason: string,
  actorUserId?: string | null
) {
  const c = await db.creativeVersion.findUnique({ where: { id } });
  if (!c) return { error: "Creative not found" as const };
  if (c.status !== "SUBMITTED") return { error: `Cannot reject from ${c.status}` as const };
  const updated = await db.creativeVersion.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedByUserId: actorUserId ?? null,
      rejectReason: reason,
      updatedAt: new Date(),
    },
  });
  return { creative: updated };
}

export async function recordCmsHandoff(
  db: Db,
  id: string,
  input: { status: "MANUAL_SENT" | "CONFIRMED_EXTERNAL" | "FAILED"; note?: string }
) {
  const c = await db.creativeVersion.findUnique({ where: { id } });
  if (!c) return { error: "Creative not found" as const };
  if (c.status !== "APPROVED") {
    return { error: "CMS handoff requires an approved creative" as const };
  }
  const updated = await db.creativeVersion.update({
    where: { id },
    data: {
      cmsHandoffStatus: input.status,
      cmsHandoffNote: input.note ?? null,
      cmsHandoffAt: new Date(),
      updatedAt: new Date(),
    },
  });
  return {
    creative: updated,
    note: "Manual CMS handoff only — does not schedule or confirm playback automatically.",
  };
}

export function customerSafeCreative(c: {
  id: string;
  revisionNumber: number;
  status: string;
  label: string | null;
  contentType: string;
  widthPx: number | null;
  heightPx: number | null;
  durationMs: number | null;
  cmsHandoffStatus: string;
  reviewedAt: Date | null;
  rejectReason: string | null;
}) {
  return {
    id: c.id,
    revisionNumber: c.revisionNumber,
    status: c.status,
    label: c.label,
    contentType: c.contentType,
    widthPx: c.widthPx,
    heightPx: c.heightPx,
    durationMs: c.durationMs,
    cmsHandoffStatus: c.cmsHandoffStatus,
    reviewedAt: c.reviewedAt?.toISOString() ?? null,
    rejectReason: c.status === "REJECTED" ? c.rejectReason : null,
    // Never expose r2Key/storage internals to customers via this serializer
  };
}
