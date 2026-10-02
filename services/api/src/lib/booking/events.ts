import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type BookingChangeEventType =
  | "booking.created"
  | "booking.status_changed"
  | "booking.item_status_changed"
  | "booking.amended"
  | "booking.cancelled"
  | "booking.hold_expired";

/** Persist outbox row for Pulse/Bridge consumers. Does not imply external delivery. */
export async function enqueueBookingChange(
  tx: Db,
  input: {
    bookingId: string;
    eventType: BookingChangeEventType;
    payload: Record<string, unknown>;
  }
) {
  await tx.bookingChangeOutbox.create({
    data: {
      bookingId: input.bookingId,
      eventType: input.eventType,
      payloadJson: input.payload as Prisma.InputJsonValue,
    },
  });
}
