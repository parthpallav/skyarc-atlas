/**
 * Effective-dated device ↔ screen mappings (Atlas-owned).
 * Historical observations join using mapping valid at observation time.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export function mappingCoversInstant(
  mapping: { validFrom: Date; validTo: Date | null },
  at: Date
): boolean {
  if (at < mapping.validFrom) return false;
  if (mapping.validTo && at >= mapping.validTo) return false;
  return true;
}

export async function assignDeviceToScreen(
  db: Db,
  input: {
    deviceId: string;
    screenId: string;
    tenantOrganizationId?: string | null;
    validFrom?: Date;
    reason?: string;
    actorUserId?: string | null;
  }
) {
  const validFrom = input.validFrom ?? new Date();
  const open = await db.deviceScreenMapping.findMany({
    where: { deviceId: input.deviceId, validTo: null },
  });

  const conflicts = open.filter((m) => m.screenId !== input.screenId);
  for (const c of conflicts) {
    await db.deviceScreenMapping.update({
      where: { id: c.id },
      data: {
        validTo: validFrom,
        conflictNote: `Closed on relocation to screen ${input.screenId}`,
        updatedAt: new Date(),
      },
    });
  }

  // Same screen already open — no-op
  const same = open.find((m) => m.screenId === input.screenId);
  if (same) {
    return { mapping: same, relocated: false as const, closedConflicts: conflicts.length };
  }

  const mapping = await db.deviceScreenMapping.create({
    data: {
      deviceId: input.deviceId,
      screenId: input.screenId,
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      validFrom,
      reason: input.reason ?? "assign",
      conflictNote:
        conflicts.length > 0
          ? `Relocated; closed ${conflicts.length} prior open mapping(s)`
          : null,
      createdByUserId: input.actorUserId ?? null,
    },
  });

  // Keep Device.screenId as current pointer for operational convenience
  await db.device.update({
    where: { id: input.deviceId },
    data: { screenId: input.screenId, updatedAt: new Date() },
  });

  return { mapping, relocated: conflicts.length > 0, closedConflicts: conflicts.length };
}

export async function screenForDeviceAt(
  db: Db,
  deviceId: string,
  at: Date
): Promise<string | null> {
  const rows = await db.deviceScreenMapping.findMany({
    where: { deviceId, validFrom: { lte: at } },
    orderBy: { validFrom: "desc" },
  });
  const hit = rows.find((m) => mappingCoversInstant(m, at));
  if (hit) return hit.screenId;
  // Fallback to current device.screenId only for observations after last mapping start
  const device = await db.device.findUnique({ where: { id: deviceId } });
  return device?.screenId ?? null;
}

/**
 * Associate an observation with booking items for a campaign.
 * Screen-level traffic may contextualize several concurrent campaigns —
 * do NOT credit every campaign with all traffic as measured impressions.
 */
export function associateObservationToBookings(input: {
  observationAt: Date;
  screenId: string;
  measurementType: string;
  capabilityOk: boolean;
  bookingItems: Array<{
    id: string;
    bookingId: string;
    inventoryId: string;
    screenId: string | null;
    startDate: Date;
    endDate: Date;
    status: string;
  }>;
  operatingScheduleAllows?: boolean;
  hasTrustedPlaybackIds?: boolean;
}): {
  affectedBookingItemIds: string[];
  associationKind: "contextual_screen" | "trusted_playback" | "none";
  limitations: string[];
} {
  const limitations: string[] = [];
  if (!input.capabilityOk) {
    limitations.push("Measurement capability unsupported or unknown for this device");
    return { affectedBookingItemIds: [], associationKind: "none", limitations };
  }
  if (input.operatingScheduleAllows === false) {
    limitations.push("Outside operating schedule — observation not associated");
    return { affectedBookingItemIds: [], associationKind: "none", limitations };
  }

  const inFlight = input.bookingItems.filter((b) => {
    if (!b.screenId || b.screenId !== input.screenId) return false;
    if (["CANCELLED", "REJECTED", "EXPIRED"].includes(b.status)) return false;
    return input.observationAt >= b.startDate && input.observationAt <= b.endDate;
  });

  if (inFlight.length === 0) {
    limitations.push("No active booking items on mapped screen for observation time");
    return { affectedBookingItemIds: [], associationKind: "none", limitations };
  }

  const isTraffic =
    input.measurementType === "traffic_count" || input.measurementType === "audience_obs";
  if (isTraffic) {
    limitations.push(
      "Screen-level traffic contextualizes concurrent campaigns — not measured impressions per campaign"
    );
    return {
      affectedBookingItemIds: inFlight.map((b) => b.id),
      associationKind: "contextual_screen",
      limitations,
    };
  }

  if (input.measurementType === "playback") {
    if (!input.hasTrustedPlaybackIds) {
      limitations.push(
        "Playback without creative/campaign identifiers is not trusted delivery attribution"
      );
      return { affectedBookingItemIds: [], associationKind: "none", limitations };
    }
    return {
      affectedBookingItemIds: inFlight.map((b) => b.id),
      associationKind: "trusted_playback",
      limitations: ["Trusted playback requires supported CMS/player integration identifiers"],
    };
  }

  return {
    affectedBookingItemIds: inFlight.map((b) => b.id),
    associationKind: "contextual_screen",
    limitations: [
      "Operational evidence only — does not auto-cancel bookings, issue credits, or promise replacements",
    ],
  };
}
