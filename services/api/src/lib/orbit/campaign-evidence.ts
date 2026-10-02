/**
 * Campaign Orbit evidence view — staff authorized.
 * Missing evidence is explicit. No auto cancel/credit/replacement.
 */
import type { PrismaClient } from "@prisma/client";
import type { Env } from "@skyarc/config";
import { fetchOrbitDeviceState } from "../orbit-client.js";
import { associateObservationToBookings, screenForDeviceAt } from "./device-mapping.js";

type Db = PrismaClient;

export async function buildCampaignOrbitEvidence(
  db: Db,
  env: Env,
  campaignId: string
) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!campaign) return { error: "Campaign not found" as const };

  const bookings = await db.booking.findMany({
    where: { campaignId, status: { notIn: ["CANCELLED", "EXPIRED"] } },
    include: {
      items: {
        include: {
          inventory: { include: { screen: { select: { id: true } } } },
        },
      },
    },
  });

  const screenIds = new Set<string>();
  const bookingItems = bookings.flatMap((b) =>
    b.items.map((i) => {
      const screenId = i.inventory.screen.id;
      screenIds.add(screenId);
      return {
        id: i.id,
        bookingId: b.id,
        inventoryId: i.inventoryId,
        screenId,
        startDate: b.startDate,
        endDate: b.endDate,
        status: i.status,
      };
    })
  );

  const devices = await db.device.findMany({
    where: { screenId: { in: [...screenIds] }, provider: "orbit" },
  });

  const deviceEvidence = [];
  const affectedIntervals: Array<{
    bookingItemId: string;
    kind: string;
    limitation: string;
  }> = [];
  const limitations = [
    "Does not automatically cancel bookings, issue credits, or promise replacement inventory",
    "Audience forecasting, impressions, unique reach, and verified delivery metrics are deferred until evidence sources are validated",
    "Heartbeat proves connectivity only — not screen power or campaign playback",
  ];

  for (const device of devices) {
    const orbitState = await fetchOrbitDeviceState(env, device.externalId);
    const mappings = await db.deviceScreenMapping.findMany({
      where: { deviceId: device.id },
      orderBy: { validFrom: "asc" },
    });

    const freshness = {
      lastEventAt: device.lastEventAt?.toISOString() ?? null,
      atlasStatus: device.status,
      orbitConnected: orbitState
        ? Boolean((orbitState.connectivity as { online?: boolean } | null)?.online)
        : null,
      sensorHealth: (orbitState?.sensorHealth as string) ?? "unknown",
      screenPower: (orbitState?.screenPower as string) ?? "unknown",
      playbackVerified: (orbitState?.playbackVerified as string) ?? "unknown",
      orbitReachable: orbitState != null,
    };

    if (!orbitState) {
      limitations.push(`Orbit state unavailable for device ${device.externalId.slice(0, 8)}…`);
    }

    const openIncidents = Array.isArray(orbitState?.openIncidents)
      ? (orbitState!.openIncidents as Array<{ kind: string; startedAt: string }>)
      : [];

    for (const item of bookingItems.filter((bi) => bi.screenId === device.screenId)) {
      const assoc = associateObservationToBookings({
        observationAt: new Date(),
        screenId: device.screenId,
        measurementType: "diagnostic",
        capabilityOk: true,
        bookingItems: [item],
      });
      for (const id of assoc.affectedBookingItemIds) {
        affectedIntervals.push({
          bookingItemId: id,
          kind: assoc.associationKind,
          limitation: assoc.limitations.join("; "),
        });
      }
    }

    // Historical mapping check demo: observation mid-flight uses historical mapping
    const mid =
      campaign.startDate && campaign.endDate
        ? new Date((campaign.startDate.getTime() + campaign.endDate.getTime()) / 2)
        : new Date();
    const historicalScreen = await screenForDeviceAt(db, device.id, mid);

    deviceEvidence.push({
      atlasDeviceId: device.id,
      orbitDeviceId: device.externalId,
      currentScreenId: device.screenId,
      historicalScreenIdAtMidFlight: historicalScreen,
      mappings: mappings.map((m) => ({
        screenId: m.screenId,
        validFrom: m.validFrom.toISOString(),
        validTo: m.validTo?.toISOString() ?? null,
        reason: m.reason,
        conflictNote: m.conflictNote,
      })),
      freshness,
      openIncidents,
      coverage: {
        missingOrbitState: orbitState == null,
        missingEvidence: !device.lastEventAt,
      },
      evidenceSource: orbitState ? "orbit-cloud" : "atlas-device-summary-only",
    });
  }

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      startDate: campaign.startDate?.toISOString() ?? null,
      endDate: campaign.endDate?.toISOString() ?? null,
    },
    devices: deviceEvidence,
    affectedBookingItems: affectedIntervals,
    limitations: [...new Set(limitations)],
    note: "Staff evidence view — missing evidence is explicit; no commercial mutation",
  };
}

export async function createOperationalRiskSnapshot(
  db: Db,
  input: {
    campaignId: string;
    tenantOrganizationId?: string | null;
    evidence: unknown;
    actorUserId?: string | null;
  }
) {
  const last = await db.operationalRiskSnapshot.findFirst({
    where: { campaignId: input.campaignId },
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;
  const limitations =
    input.evidence &&
    typeof input.evidence === "object" &&
    Array.isArray((input.evidence as { limitations?: unknown }).limitations)
      ? (input.evidence as { limitations: unknown[] }).limitations
      : [];

  const row = await db.operationalRiskSnapshot.create({
    data: {
      campaignId: input.campaignId,
      tenantOrganizationId: input.tenantOrganizationId ?? null,
      version,
      source: "orbit_evidence",
      snapshotJson: input.evidence as object,
      limitationsJson: limitations as object[],
      createdByUserId: input.actorUserId ?? null,
    },
  });
  return { snapshot: row };
}
