import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const ALLOWED: Record<string, Set<string>> = {
  PENDING: new Set(["READY", "CANCELLED", "SKIPPED"]),
  READY: new Set(["IN_PROGRESS", "BLOCKED", "SKIPPED", "CANCELLED"]),
  IN_PROGRESS: new Set(["DONE", "BLOCKED", "CANCELLED"]),
  BLOCKED: new Set(["READY", "CANCELLED"]),
  DONE: new Set([]),
  SKIPPED: new Set([]),
  CANCELLED: new Set([]),
};

export function canTransitionTask(from: string, to: string): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

export async function transitionExecutionTask(
  db: Db,
  input: {
    taskId: string;
    toStatus: keyof typeof ALLOWED | string;
    actorUserId?: string | null;
    note?: string;
    checklistJson?: unknown;
    blockedReason?: string | null;
    ownerUserId?: string | null;
    dueAt?: Date | null;
  }
) {
  const task = await db.executionTask.findUnique({ where: { id: input.taskId } });
  if (!task) return { error: "Task not found" as const };
  if (!canTransitionTask(task.status, input.toStatus)) {
    return { error: `Invalid task transition ${task.status} → ${input.toStatus}` as const };
  }

  if (input.toStatus === "READY" || input.toStatus === "IN_PROGRESS") {
    if (task.dependsOnTaskId) {
      const dep = await db.executionTask.findUnique({ where: { id: task.dependsOnTaskId } });
      if (dep && dep.status !== "DONE" && dep.status !== "SKIPPED") {
        return { error: "Dependency not complete" as const };
      }
    }
  }

  const updated = await db.executionTask.update({
    where: { id: task.id },
    data: {
      status: input.toStatus as never,
      blockedReason:
        input.toStatus === "BLOCKED"
          ? input.blockedReason ?? task.blockedReason
          : input.toStatus === "READY"
            ? null
            : task.blockedReason,
      checklistJson:
        input.checklistJson !== undefined
          ? (input.checklistJson as Prisma.InputJsonValue)
          : undefined,
      ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : undefined,
      dueAt: input.dueAt !== undefined ? input.dueAt : undefined,
      completedAt: input.toStatus === "DONE" ? new Date() : task.completedAt,
      updatedAt: new Date(),
    },
  });

  await db.executionTaskHistory.create({
    data: {
      taskId: task.id,
      fromStatus: task.status,
      toStatus: input.toStatus,
      actorUserId: input.actorUserId ?? null,
      note: input.note ?? null,
      patchJson: {
        blockedReason: input.blockedReason ?? null,
      },
    },
  });

  // Unlock dependents when DONE
  if (input.toStatus === "DONE" || input.toStatus === "SKIPPED") {
    await db.executionTask.updateMany({
      where: { dependsOnTaskId: task.id, status: "PENDING" },
      data: { status: "READY", updatedAt: new Date() },
    });
  }

  // Roll up booking executionStatus — never campaign lifecycle
  const siblings = await db.executionTask.findMany({
    where: { bookingId: task.bookingId },
    select: { status: true },
  });
  const active = siblings.filter((s) => s.status !== "CANCELLED" && s.status !== "SKIPPED");
  let executionStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" = "NOT_STARTED";
  if (active.some((s) => s.status === "IN_PROGRESS" || s.status === "DONE" || s.status === "BLOCKED")) {
    executionStatus = active.every((s) => s.status === "DONE") ? "COMPLETED" : "IN_PROGRESS";
  }
  await db.booking.update({
    where: { id: task.bookingId },
    data: { executionStatus, updatedAt: new Date() },
  });

  return { task: updated, executionStatus, campaignLifecycleUntouched: true as const };
}

export type CampaignReadiness = {
  campaignId: string;
  overdueCount: number;
  blockedCount: number;
  openCount: number;
  doneCount: number;
  upcomingLaunches: Array<{ taskId: string; title: string; dueAt: string | null }>;
  bookingExecutionStatuses: string[];
};

export async function computeCampaignReadiness(db: Db, campaignId: string): Promise<CampaignReadiness> {
  const tasks = await db.executionTask.findMany({
    where: { campaignId },
    select: { id: true, title: true, status: true, dueAt: true, kind: true },
  });
  const bookings = await db.booking.findMany({
    where: { campaignId },
    select: { executionStatus: true },
  });
  const now = Date.now();
  const overdue = tasks.filter(
    (t) =>
      t.dueAt &&
      t.dueAt.getTime() < now &&
      !["DONE", "SKIPPED", "CANCELLED"].includes(t.status)
  );
  const blocked = tasks.filter((t) => t.status === "BLOCKED");
  const open = tasks.filter((t) => !["DONE", "SKIPPED", "CANCELLED"].includes(t.status));
  const done = tasks.filter((t) => t.status === "DONE");
  const upcoming = tasks
    .filter((t) => t.kind === "LAUNCH_VERIFICATION" && !["DONE", "CANCELLED"].includes(t.status))
    .slice(0, 10)
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      dueAt: t.dueAt?.toISOString() ?? null,
    }));

  return {
    campaignId,
    overdueCount: overdue.length,
    blockedCount: blocked.length,
    openCount: open.length,
    doneCount: done.length,
    upcomingLaunches: upcoming,
    bookingExecutionStatuses: bookings.map((b) => b.executionStatus),
  };
}
