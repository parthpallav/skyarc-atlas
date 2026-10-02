import type { Prisma, PrismaClient } from "@prisma/client";
import { INVENTORY_HOLD_TTL_MINUTES } from "@skyarc/shared";
import {
  bookingStatusForItems,
  itemStatusForMode,
  type BookingHoldMode,
} from "./status.js";
import { assertItemTransition } from "./transitions.js";
import { enqueueBookingChange } from "./events.js";

export type { BookingHoldMode } from "./status.js";
export { bookingStatusForItems } from "./status.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type SyncBookingInput = {
  campaignId: string;
  mediaPlanId?: string | null;
  inventoryIds: string[];
  /** Map inventoryId → availabilityWindowId created in the same transaction */
  windowIdsByInventory: Record<string, string>;
  mode: BookingHoldMode;
  expiresAt: Date | null;
  startDate: Date;
  endDate: Date;
  actorUserId?: string | null;
  tenantOrganizationId?: string | null;
  idempotencyKey?: string | null;
  requireVendorApproval?: boolean;
};

async function recordTransition(
  tx: Db,
  input: {
    bookingId: string;
    bookingItemId?: string | null;
    fromStatus: string;
    toStatus: string;
    actorUserId?: string | null;
    reason?: string | null;
  }
) {
  if (input.fromStatus === input.toStatus) return;
  if (input.bookingItemId) {
    assertItemTransition(input.fromStatus, input.toStatus);
  }
  await tx.bookingTransition.create({
    data: {
      bookingId: input.bookingId,
      bookingItemId: input.bookingItemId ?? null,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason ?? null,
    },
  });
  const eventType = input.bookingItemId
    ? "booking.item_status_changed"
    : "booking.status_changed";
  await enqueueBookingChange(tx, {
    bookingId: input.bookingId,
    eventType,
    payload: {
      bookingItemId: input.bookingItemId ?? null,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
    },
  });
}

/**
 * Upsert Booking + BookingItem rows linked to capacity windows.
 * Must run inside the same transaction that created the windows when possible.
 */
export async function syncBookingWithWindows(tx: Db, input: SyncBookingInput) {
  const uniqueIds = [...new Set(input.inventoryIds)];
  if (uniqueIds.length === 0) return null;

  if (input.idempotencyKey) {
    const existingByKey = await tx.booking.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { items: true },
    });
    if (existingByKey) return existingByKey;
  }

  const inventories = await tx.inventory.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      screen: { select: { location: { select: { organizationId: true } } } },
    },
  });
  const vendorByInventory = new Map(
    inventories.map((inv) => [inv.id, inv.screen.location.organizationId ?? null])
  );

  const requireVendorApproval = Boolean(input.requireVendorApproval);
  const nextItemStatus = itemStatusForMode(input.mode, requireVendorApproval);

  let booking = await tx.booking.findFirst({
    where: {
      campaignId: input.campaignId,
      mediaPlanId: input.mediaPlanId ?? null,
      status: { notIn: ["CANCELLED", "EXPIRED"] },
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  const previousStatus = booking?.status ?? "REQUESTED";

  if (!booking) {
    booking = await tx.booking.create({
      data: {
        campaignId: input.campaignId,
        mediaPlanId: input.mediaPlanId ?? null,
        tenantOrganizationId: input.tenantOrganizationId ?? null,
        status: nextItemStatus === "CONFIRMED" ? "CONFIRMED" : nextItemStatus === "PENDING_VENDOR_APPROVAL" ? "PENDING_VENDOR_APPROVAL" : "HELD",
        paymentStatus: "NOT_REQUIRED",
        executionStatus: "NOT_STARTED",
        startDate: input.startDate,
        endDate: input.endDate,
        expiresAt: input.mode === "hold" ? input.expiresAt : null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdByUserId: input.actorUserId ?? null,
      },
      include: { items: true },
    });
    await recordTransition(tx, {
      bookingId: booking.id,
      fromStatus: "REQUESTED",
      toStatus: booking.status,
      actorUserId: input.actorUserId,
      reason: input.mode === "book" ? "reserve_book" : "reserve_hold",
    });
  } else {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        startDate: input.startDate,
        endDate: input.endDate,
        expiresAt: input.mode === "hold" ? input.expiresAt : null,
        tenantOrganizationId: input.tenantOrganizationId ?? booking.tenantOrganizationId,
        updatedAt: new Date(),
      },
    });
  }

  for (const inventoryId of uniqueIds) {
    const windowId = input.windowIdsByInventory[inventoryId] ?? null;
    const existing = booking.items.find((item) => item.inventoryId === inventoryId);
    if (existing) {
      const from = existing.status;
      const updated = await tx.bookingItem.update({
        where: { id: existing.id },
        data: {
          status: nextItemStatus,
          availabilityWindowId: windowId,
          vendorOrganizationId: vendorByInventory.get(inventoryId) ?? existing.vendorOrganizationId,
          slotsConsumed: 1,
          updatedAt: new Date(),
        },
      });
      await recordTransition(tx, {
        bookingId: booking.id,
        bookingItemId: updated.id,
        fromStatus: from,
        toStatus: nextItemStatus,
        actorUserId: input.actorUserId,
        reason: input.mode === "book" ? "item_booked" : "item_held",
      });
    } else {
      const created = await tx.bookingItem.create({
        data: {
          bookingId: booking.id,
          inventoryId,
          availabilityWindowId: windowId,
          vendorOrganizationId: vendorByInventory.get(inventoryId) ?? null,
          status: nextItemStatus,
          slotsConsumed: 1,
        },
      });
      await recordTransition(tx, {
        bookingId: booking.id,
        bookingItemId: created.id,
        fromStatus: "REQUESTED",
        toStatus: nextItemStatus,
        actorUserId: input.actorUserId,
        reason: input.mode === "book" ? "item_booked" : "item_held",
      });
    }
  }

  const refreshedItems = await tx.bookingItem.findMany({
    where: { bookingId: booking.id },
    select: { status: true },
  });
  const nextBookingStatus = bookingStatusForItems(refreshedItems.map((i) => i.status));
  if (nextBookingStatus !== previousStatus || !booking) {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: nextBookingStatus, updatedAt: new Date() },
    });
    await recordTransition(tx, {
      bookingId: booking.id,
      fromStatus: previousStatus,
      toStatus: nextBookingStatus,
      actorUserId: input.actorUserId,
      reason: "recompute_status",
    });
  }

  return tx.booking.findUnique({
    where: { id: booking.id },
    include: {
      items: true,
      transitions: { orderBy: { createdAt: "asc" }, take: 100 },
    },
  });
}

export async function cancelBookingItemsForInventories(
  tx: Db,
  input: {
    campaignId: string;
    inventoryIds: string[];
    actorUserId?: string | null;
    reason?: string;
  }
) {
  const items = await tx.bookingItem.findMany({
    where: {
      inventoryId: { in: input.inventoryIds },
      status: { notIn: ["CANCELLED", "REJECTED"] },
      booking: { campaignId: input.campaignId, status: { not: "CANCELLED" } },
    },
    include: { booking: { select: { id: true, status: true } } },
  });

  for (const item of items) {
    await tx.bookingItem.update({
      where: { id: item.id },
      data: {
        status: "CANCELLED",
        availabilityWindowId: null,
        updatedAt: new Date(),
      },
    });
    await recordTransition(tx, {
      bookingId: item.bookingId,
      bookingItemId: item.id,
      fromStatus: item.status,
      toStatus: "CANCELLED",
      actorUserId: input.actorUserId,
      reason: input.reason ?? "capacity_released",
    });
  }

  const bookingIds = [...new Set(items.map((i) => i.bookingId))];
  for (const bookingId of bookingIds) {
    const remaining = await tx.bookingItem.findMany({
      where: { bookingId },
      select: { status: true },
    });
    const next = bookingStatusForItems(remaining.map((r) => r.status));
    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.status === next) continue;
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: next, updatedAt: new Date() },
    });
    await recordTransition(tx, {
      bookingId,
      fromStatus: booking.status,
      toStatus: next,
      actorUserId: input.actorUserId,
      reason: input.reason ?? "capacity_released",
    });
  }
}

export async function applyVendorItemDecisions(
  prisma: PrismaClient,
  input: {
    bookingId: string;
    vendorOrganizationId: string;
    inventoryIds?: string[];
    action: "APPROVE" | "REJECT";
    actorUserId?: string | null;
  }
) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: { items: true, campaign: { select: { id: true, startDate: true, endDate: true } } },
    });
    if (!booking) return null;

    const targets = booking.items.filter((item) => {
      if (item.vendorOrganizationId !== input.vendorOrganizationId) return false;
      if (item.status === "CANCELLED" || item.status === "REJECTED") return false;
      if (input.inventoryIds?.length && !input.inventoryIds.includes(item.inventoryId)) return false;
      return true;
    });

    for (const item of targets) {
      if (input.action === "REJECT") {
        const windowId =
          item.availabilityWindowId ??
          (
            await tx.availabilityWindow.findFirst({
              where: { bookingItem: { id: item.id } },
              select: { id: true },
            })
          )?.id;
        if (windowId) {
          await tx.availabilityWindow.deleteMany({ where: { id: windowId } });
        }
        await tx.bookingItem.update({
          where: { id: item.id },
          data: { status: "REJECTED", availabilityWindowId: null, updatedAt: new Date() },
        });
        await recordTransition(tx, {
          bookingId: booking.id,
          bookingItemId: item.id,
          fromStatus: item.status,
          toStatus: "REJECTED",
          actorUserId: input.actorUserId,
          reason: "vendor_reject",
        });
      } else {
        // Promote HELD → BOOKED on linked window
        if (item.availabilityWindowId) {
          await tx.availabilityWindow.update({
            where: { id: item.availabilityWindowId },
            data: { status: "BOOKED", expiresAt: null, notes: `Booked for campaign ${booking.campaignId}` },
          });
        }
        await tx.bookingItem.update({
          where: { id: item.id },
          data: { status: "CONFIRMED", updatedAt: new Date() },
        });
        await recordTransition(tx, {
          bookingId: booking.id,
          bookingItemId: item.id,
          fromStatus: item.status,
          toStatus: "CONFIRMED",
          actorUserId: input.actorUserId,
          reason: "vendor_approve",
        });
      }
    }

    const refreshed = await tx.bookingItem.findMany({
      where: { bookingId: booking.id },
      select: { status: true },
    });
    const next = bookingStatusForItems(refreshed.map((r) => r.status));
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: next, expiresAt: next === "CONFIRMED" ? null : booking.expiresAt, updatedAt: new Date() },
    });
    await recordTransition(tx, {
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: next,
      actorUserId: input.actorUserId,
      reason: "vendor_decision_recompute",
    });

    return tx.booking.findUnique({
      where: { id: booking.id },
      include: {
        items: true,
        transitions: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    });
  });
}

/** Expire soft holds past expiresAt and mark linked booking items CANCELLED. */
export async function expireStaleHolds(prisma: PrismaClient, now = new Date()) {
  const expiredWindows = await prisma.availabilityWindow.findMany({
    where: {
      status: "HELD",
      expiresAt: { lt: now },
    },
    select: { id: true, inventoryId: true, campaignId: true, notes: true },
  });

  if (expiredWindows.length === 0) {
    return { expiredWindows: 0, cancelledItems: 0 };
  }

  let cancelledItems = 0;

  await prisma.$transaction(async (tx) => {
    const windowIds = expiredWindows.map((w) => w.id);
    await tx.availabilityWindow.deleteMany({ where: { id: { in: windowIds } } });

    const items = await tx.bookingItem.findMany({
      where: {
        OR: [
          { availabilityWindowId: { in: windowIds } },
          {
            status: { in: ["HELD", "PENDING_VENDOR_APPROVAL"] },
            booking: { expiresAt: { lt: now }, status: { in: ["HELD", "PENDING_VENDOR_APPROVAL", "PARTIALLY_APPROVED"] } },
          },
        ],
      },
    });

    for (const item of items) {
      const toStatus = item.status === "HELD" || item.status === "PENDING_VENDOR_APPROVAL" ? "EXPIRED" : "CANCELLED";
      await tx.bookingItem.update({
        where: { id: item.id },
        data: { status: toStatus, availabilityWindowId: null, updatedAt: now },
      });
      await recordTransition(tx, {
        bookingId: item.bookingId,
        bookingItemId: item.id,
        fromStatus: item.status,
        toStatus,
        reason: "hold_expired",
      });
      cancelledItems += 1;
    }

    for (const bookingId of [...new Set(items.map((i) => i.bookingId))]) {
      await enqueueBookingChange(tx, {
        bookingId,
        eventType: "booking.hold_expired",
        payload: { at: now.toISOString() },
      });
    }

    const bookingIds = [...new Set(items.map((i) => i.bookingId))];
    for (const bookingId of bookingIds) {
      const remaining = await tx.bookingItem.findMany({
        where: { bookingId },
        select: { status: true },
      });
      const next = bookingStatusForItems(remaining.map((r) => r.status));
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.status === next) continue;
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: next, updatedAt: now },
      });
      await recordTransition(tx, {
        bookingId,
        fromStatus: booking.status,
        toStatus: next,
        reason: "hold_expired",
      });
    }
  });

  return { expiredWindows: expiredWindows.length, cancelledItems };
}

export function defaultHoldExpiry(from = new Date()): Date {
  return new Date(from.getTime() + INVENTORY_HOLD_TTL_MINUTES * 60_000);
}

