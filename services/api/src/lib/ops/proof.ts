/**
 * Proof of campaign execution — separate from inventory survey photos.
 * Timestamps/GPS are supplied evidence, not guaranteed authenticity.
 * Missing proof stays pending; never invent verified digital proof-of-play.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export async function createProofRecord(
  db: Db,
  input: {
    tenantOrganizationId?: string | null;
    campaignId: string;
    bookingId?: string | null;
    bookingItemId?: string | null;
    locationId: string;
    locationAssetId: string;
    executionTaskId?: string | null;
    kind?: "PRE_MOUNT" | "LIVE_ON_SITE" | "MID_FLIGHT" | "POST_REMOVAL" | "OTHER";
    capturedAt?: Date | null;
    capturedLat?: number | null;
    capturedLng?: number | null;
    capturedAccuracyM?: number | null;
    submitterUserId?: string | null;
    provenanceNote?: string | null;
    replacesProofId?: string | null;
  }
) {
  if (input.replacesProofId) {
    const prior = await db.proofRecord.findUnique({ where: { id: input.replacesProofId } });
    if (!prior) return { error: "Proof to replace not found" as const };
    if (prior.campaignId !== input.campaignId) {
      return { error: "Cannot replace proof from another campaign" as const };
    }
    if (
      input.tenantOrganizationId &&
      prior.tenantOrganizationId &&
      prior.tenantOrganizationId !== input.tenantOrganizationId
    ) {
      return { error: "Cannot replace proof from another tenant" as const };
    }
    await db.proofRecord.update({
      where: { id: input.replacesProofId },
      data: { reviewStatus: "REPLACED", updatedAt: new Date() },
    });
  }

  const row = await db.proofRecord.create({
    data: {
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      campaignId: input.campaignId,
      bookingId: input.bookingId ?? null,
      bookingItemId: input.bookingItemId ?? null,
      locationId: input.locationId,
      locationAssetId: input.locationAssetId,
      executionTaskId: input.executionTaskId ?? null,
      kind: input.kind ?? "LIVE_ON_SITE",
      reviewStatus: "PENDING_REVIEW",
      capturedAt: input.capturedAt ?? null,
      uploadedAt: new Date(),
      capturedLat: input.capturedLat ?? null,
      capturedLng: input.capturedLng ?? null,
      capturedAccuracyM: input.capturedAccuracyM ?? null,
      submitterUserId: input.submitterUserId ?? null,
      provenanceNote:
        input.provenanceNote ??
        "Supplied GPS/timestamps are evidence claims, not authenticated proof of authenticity.",
      replacesProofId: input.replacesProofId ?? null,
    },
  });
  return { proof: row };
}

export async function reviewProof(
  db: Db,
  input: {
    proofId: string;
    decision: "APPROVED" | "REJECTED";
    actorUserId?: string | null;
    rejectReason?: string;
  }
) {
  const proof = await db.proofRecord.findUnique({ where: { id: input.proofId } });
  if (!proof) return { error: "Proof not found" as const };
  if (proof.reviewStatus !== "PENDING_REVIEW") {
    return { error: `Cannot review from ${proof.reviewStatus}` as const };
  }
  if (input.decision === "REJECTED" && !input.rejectReason) {
    return { error: "Rejection reason required" as const };
  }

  const updated = await db.proofRecord.update({
    where: { id: proof.id },
    data: {
      reviewStatus: input.decision,
      reviewedAt: new Date(),
      reviewedByUserId: input.actorUserId ?? null,
      rejectReason: input.decision === "REJECTED" ? input.rejectReason! : null,
      updatedAt: new Date(),
    },
  });

  // Approving launch proof may complete linked LAUNCH_VERIFICATION / proof task — not campaign LIVE
  if (input.decision === "APPROVED" && proof.executionTaskId) {
    const task = await db.executionTask.findUnique({ where: { id: proof.executionTaskId } });
    if (task && (task.status === "READY" || task.status === "IN_PROGRESS")) {
      await db.executionTask.update({
        where: { id: task.id },
        data: { status: "DONE", completedAt: new Date(), updatedAt: new Date() },
      });
      await db.executionTaskHistory.create({
        data: {
          taskId: task.id,
          fromStatus: task.status,
          toStatus: "DONE",
          actorUserId: input.actorUserId ?? null,
          note: "completed_via_approved_proof",
        },
      });
      await db.executionTask.updateMany({
        where: { dependsOnTaskId: task.id, status: "PENDING" },
        data: { status: "READY", updatedAt: new Date() },
      });
    }
  }

  return { proof: updated, campaignLifecycleUntouched: true as const };
}

export function customerSafeProof(p: {
  id: string;
  kind: string;
  reviewStatus: string;
  capturedAt: Date | null;
  uploadedAt: Date;
  locationId: string;
  locationAssetId: string;
  provenanceNote: string | null;
}) {
  return {
    id: p.id,
    kind: p.kind,
    reviewStatus: p.reviewStatus,
    capturedAt: p.capturedAt?.toISOString() ?? null,
    uploadedAt: p.uploadedAt.toISOString(),
    locationId: p.locationId,
    locationAssetId: p.locationAssetId,
    evidenceDisclaimer:
      p.provenanceNote ??
      "Uploaded timestamps and GPS are supplied evidence, not guaranteed authenticity.",
  };
}

export async function proofCompletionSummary(db: Db, campaignId: string) {
  const rows = await db.proofRecord.groupBy({
    by: ["reviewStatus"],
    where: { campaignId },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.reviewStatus] = r._count._all;
  return {
    approved: counts.APPROVED ?? 0,
    pending: counts.PENDING_REVIEW ?? 0,
    rejected: counts.REJECTED ?? 0,
    replaced: counts.REPLACED ?? 0,
    missingFlag: (counts.APPROVED ?? 0) === 0,
  };
}
