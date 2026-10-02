/**
 * Idempotent execution-task seeding when a booking is confirmed.
 * Never mutates Campaign.lifecycleStatus.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { stepsForTemplate, templateKeyForInventory } from "./task-templates.js";

type Db = PrismaClient | Prisma.TransactionClient;

export async function seedExecutionTasksForBooking(
  db: Db,
  bookingId: string,
  opts: { actorUserId?: string | null } = {}
) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      items: {
        where: { status: { in: ["CONFIRMED", "APPROVED"] } },
        include: { inventory: { select: { id: true, inventoryType: true } } },
      },
    },
  });
  if (!booking) return { error: "Booking not found" as const };
  if (booking.status !== "CONFIRMED" && booking.status !== "PARTIALLY_APPROVED") {
    return { error: "Booking must be confirmed before seeding tasks" as const };
  }

  const created: string[] = [];
  const flightStart = booking.startDate;

  for (const item of booking.items) {
    const templateKey = templateKeyForInventory(item.inventory.inventoryType);
    const steps = stepsForTemplate(templateKey);
    let prevTaskId: string | null = null;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      const dedupeKey = `${item.id}:${step.kind}`;
      const existing = await db.executionTask.findUnique({
        where: { bookingId_dedupeKey: { bookingId, dedupeKey } },
      });
      if (existing) {
        prevTaskId = existing.id;
        continue;
      }
      const dueAt = new Date(flightStart);
      dueAt.setUTCDate(dueAt.getUTCDate() + step.dueOffsetDays);
      const status = i === 0 ? "READY" : "PENDING";
      const createdTask = await db.executionTask.create({
        data: {
          tenantOrganizationId: booking.tenantOrganizationId,
          campaignId: booking.campaignId,
          bookingId: booking.id,
          bookingItemId: item.id,
          dedupeKey,
          kind: step.kind,
          status,
          templateKey,
          title: step.title,
          dueAt,
          dependsOnTaskId: prevTaskId,
          checklistJson: step.checklist.map((label) => ({ label, done: false })),
          sortOrder: i,
        },
      });
      const taskId = createdTask.id as string;
      await db.executionTaskHistory.create({
        data: {
          taskId,
          fromStatus: null,
          toStatus: status,
          actorUserId: opts.actorUserId ?? null,
          note: "seeded_on_booking_confirm",
        },
      });
      created.push(taskId);
      prevTaskId = taskId;
    }
  }

  // Explicit: do not touch campaign.lifecycleStatus
  return {
    bookingId,
    campaignId: booking.campaignId,
    createdCount: created.length,
    campaignLifecycleUntouched: true as const,
  };
}
