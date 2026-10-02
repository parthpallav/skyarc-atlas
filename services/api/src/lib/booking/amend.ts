import type { PrismaClient } from "@prisma/client";
import { holdInventoryForCampaign, releaseInventoryForCampaign } from "../media-planning/run-optimization.js";
import { bookingStatusForItems } from "./status.js";
import { enqueueBookingChange } from "./events.js";

export async function amendBooking(
  prisma: PrismaClient,
  input: {
    bookingId: string;
    actorUserId?: string | null;
    addInventoryIds?: string[];
    removeInventoryIds?: string[];
    startDate?: Date;
    endDate?: Date;
  }
) {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { items: true },
  });
  if (!booking) return { error: "Booking not found" as const };
  if (booking.status === "CANCELLED" || booking.status === "EXPIRED") {
    return { error: "Booking cannot be amended" as const };
  }

  const add = [...new Set(input.addInventoryIds ?? [])];
  const remove = [...new Set(input.removeInventoryIds ?? [])];
  if (add.some((id) => remove.includes(id))) {
    return { error: "Cannot add and remove the same inventory" as const };
  }

  const nextStart = input.startDate ?? booking.startDate;
  const nextEnd = input.endDate ?? booking.endDate;
  if (nextEnd < nextStart) return { error: "Invalid flight dates" as const };

  const preserved = booking.items.map((i) => ({ ...i }));

  try {
    if (add.length) {
      const mode =
        booking.status === "CONFIRMED" || booking.status === "PARTIALLY_APPROVED" ? "book" : "hold";
      const hold = await holdInventoryForCampaign(prisma, booking.campaignId, add, mode, {
        mediaPlanId: booking.mediaPlanId,
        actorUserId: input.actorUserId,
        tenantOrganizationId: booking.tenantOrganizationId,
        syncBooking: true,
      });
      if (hold.skipped.length > 0) {
        return {
          error: `Amendment failed: no capacity for ${hold.skipped.length} site(s)`,
          preserved,
        };
      }
    }

    if (remove.length) {
      await releaseInventoryForCampaign(prisma, booking.campaignId, remove, {
        actorUserId: input.actorUserId,
        reason: "amendment_remove",
      });
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: { startDate: nextStart, endDate: nextEnd, updatedAt: new Date() },
    });

    const refreshed = await prisma.bookingItem.findMany({
      where: { bookingId: booking.id },
      select: { status: true },
    });
    const nextStatus = bookingStatusForItems(refreshed.map((r) => r.status));
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: nextStatus, updatedAt: new Date() },
    });

    await prisma.$transaction(async (tx) => {
      await enqueueBookingChange(tx, {
        bookingId: booking.id,
        eventType: "booking.amended",
        payload: {
          added: add,
          removed: remove,
          startDate: nextStart.toISOString(),
          endDate: nextEnd.toISOString(),
        },
      });
    });

    return prisma.booking.findUnique({
      where: { id: booking.id },
      include: {
        items: true,
        transitions: { orderBy: { createdAt: "asc" }, take: 200 },
        campaign: { select: { id: true, name: true, lifecycleStatus: true } },
      },
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Amendment failed",
      preserved,
    };
  }
}
