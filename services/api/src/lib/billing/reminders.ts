/**
 * Reminder / notification jobs.
 * Bridge delivery when configured; otherwise CONFIGURATION_REQUIRED.
 * Never report unsent notifications as delivered.
 */
import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient;

export function bridgeDeliveryConfigured(): boolean {
  return Boolean(process.env.BRIDGE_NOTIFY_URL?.trim() || process.env.BRIDGE_WHATSAPP_ENABLED === "true");
}

export async function enqueueReminder(
  db: Db,
  input: {
    tenantOrganizationId?: string | null;
    campaignId?: string | null;
    kind: "TASK_DEADLINE" | "MISSING_PROOF" | "OVERDUE_INVOICE" | "OTHER";
    dueAt: Date;
    payload: Record<string, unknown>;
  }
) {
  const configured = bridgeDeliveryConfigured();
  const job = await db.reminderJob.create({
    data: {
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      campaignId: input.campaignId ?? null,
      kind: input.kind,
      dueAt: input.dueAt,
      payloadJson: input.payload as import("@prisma/client").Prisma.InputJsonValue,
      status: configured ? "PENDING" : "CONFIGURATION_REQUIRED",
      deliveryChannel: configured ? "bridge" : "none",
      deliveryStatusNote: configured
        ? "Queued for Bridge delivery when worker runs"
        : "Bridge delivery not configured — reminder persisted but not sent",
      sentAt: null,
    },
  });
  return {
    job,
    delivered: false as const,
    note: configured
      ? "Reminder pending delivery — not yet sent"
      : "CONFIGURATION_REQUIRED — not delivered",
  };
}

export async function markReminderSent(db: Db, jobId: string) {
  const job = await db.reminderJob.findUnique({ where: { id: jobId } });
  if (!job) return { error: "Reminder not found" as const };
  if (job.status === "CONFIGURATION_REQUIRED") {
    return { error: "Cannot mark CONFIGURATION_REQUIRED reminder as sent" as const };
  }
  if (job.status === "SENT") return { job, idempotent: true as const };
  const updated = await db.reminderJob.update({
    where: { id: jobId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      deliveryStatusNote: "Delivered via Bridge",
      updatedAt: new Date(),
    },
  });
  return { job: updated, idempotent: false as const };
}

export function serializeReminder(job: {
  id: string;
  kind: string;
  status: string;
  dueAt: Date;
  deliveryChannel: string | null;
  deliveryStatusNote: string | null;
  sentAt: Date | null;
}) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    dueAt: job.dueAt.toISOString(),
    deliveryChannel: job.deliveryChannel,
    deliveryStatusNote: job.deliveryStatusNote,
    sentAt: job.sentAt?.toISOString() ?? null,
    delivered: job.status === "SENT" && job.sentAt != null,
  };
}
