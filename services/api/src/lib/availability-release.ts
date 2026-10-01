import type { PrismaClient } from "@prisma/client";

const BLOCKING = new Set(["BOOKED", "HELD", "BLOCKED"]);

export function flightBounds(from: string, to: string) {
  return {
    start: new Date(`${from}T00:00:00.000Z`),
    end: new Date(`${to}T23:59:59.999Z`),
  };
}

export async function loadOverlappingBlockingWindows(
  prisma: PrismaClient,
  locationIds: string[],
  from: string,
  to: string
) {
  const { start, end } = flightBounds(from, to);
  return prisma.availabilityWindow.findMany({
    where: {
      status: { in: ["BOOKED", "HELD", "BLOCKED"] },
      startDate: { lte: end },
      endDate: { gte: start },
      inventory: { screen: { locationId: { in: locationIds } } },
    },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      inventoryId: true,
      inventory: {
        select: {
          id: true,
          screen: { select: { locationId: true } },
        },
      },
    },
  });
}

export async function buildAvailabilityReleasePreview(
  prisma: PrismaClient,
  locationIds: string[],
  from: string,
  to: string
) {
  const windows = await loadOverlappingBlockingWindows(prisma, locationIds, from, to);
  const inventoryIds = [...new Set(windows.map((w) => w.inventoryId))];

  const planItems =
    inventoryIds.length === 0
      ? []
      : await prisma.mediaPlanItem.findMany({
          where: { inventoryId: { in: inventoryIds } },
          select: {
            id: true,
            inventoryId: true,
            mediaPlan: {
              select: {
                id: true,
                name: true,
                status: true,
                campaignId: true,
                campaign: {
                  select: {
                    id: true,
                    name: true,
                    lifecycleStatus: true,
                    startDate: true,
                    endDate: true,
                  },
                },
              },
            },
          },
        });

  const byLocation = new Map<
    string,
    {
      locationId: string;
      overlappingWindows: Array<{
        id: string;
        status: string;
        startDate: string;
        endDate: string;
        inventoryId: string;
      }>;
      affectedCampaigns: Array<{ id: string; name: string; lifecycleStatus: string }>;
      affectedMediaPlans: Array<{
        id: string;
        name: string;
        status: string;
        campaignId: string;
      }>;
    }
  >();

  for (const id of locationIds) {
    byLocation.set(id, {
      locationId: id,
      overlappingWindows: [],
      affectedCampaigns: [],
      affectedMediaPlans: [],
    });
  }

  for (const w of windows) {
    const locationId = w.inventory.screen.locationId;
    const bucket = byLocation.get(locationId);
    if (!bucket) continue;
    bucket.overlappingWindows.push({
      id: w.id,
      status: w.status,
      startDate: w.startDate.toISOString().slice(0, 10),
      endDate: w.endDate.toISOString().slice(0, 10),
      inventoryId: w.inventoryId,
    });
  }

  const campaignSeen = new Map<string, Set<string>>();
  const planSeen = new Map<string, Set<string>>();

  for (const item of planItems) {
    const win = windows.find((w) => w.inventoryId === item.inventoryId);
    if (!win) continue;
    const locationId = win.inventory.screen.locationId;
    const bucket = byLocation.get(locationId);
    if (!bucket) continue;

    const campSet = campaignSeen.get(locationId) ?? new Set();
    campaignSeen.set(locationId, campSet);
    const planSet = planSeen.get(locationId) ?? new Set();
    planSeen.set(locationId, planSet);

    const campaign = item.mediaPlan.campaign;
    if (!campSet.has(campaign.id)) {
      campSet.add(campaign.id);
      bucket.affectedCampaigns.push({
        id: campaign.id,
        name: campaign.name,
        lifecycleStatus: campaign.lifecycleStatus,
      });
    }
    if (!planSet.has(item.mediaPlan.id)) {
      planSet.add(item.mediaPlan.id);
      bucket.affectedMediaPlans.push({
        id: item.mediaPlan.id,
        name: item.mediaPlan.name,
        status: item.mediaPlan.status,
        campaignId: item.mediaPlan.campaignId,
      });
    }
  }

  return {
    from,
    to,
    locations: locationIds.map((id) => byLocation.get(id)!),
    totalOverlappingWindows: windows.length,
  };
}

export async function releaseAvailabilityForWindow(
  prisma: PrismaClient,
  opts: {
    locationIds: string[];
    from: string;
    to: string;
    reason: string;
    actorUserId: string;
  }
) {
  const preview = await buildAvailabilityReleasePreview(
    prisma,
    opts.locationIds,
    opts.from,
    opts.to
  );
  const windowIds = preview.locations.flatMap((l) =>
    l.overlappingWindows.map((w) => w.id)
  );
  const inventoryIds = [
    ...new Set(preview.locations.flatMap((l) => l.overlappingWindows.map((w) => w.inventoryId))),
  ];

  await prisma.$transaction(async (tx) => {
    if (windowIds.length > 0) {
      await tx.availabilityWindow.deleteMany({ where: { id: { in: windowIds } } });
    }
    if (inventoryIds.length > 0) {
      await tx.inventory.updateMany({
        where: { id: { in: inventoryIds } },
        data: { status: "AVAILABLE" },
      });
    }
    await tx.inventory.updateMany({
      where: { screen: { locationId: { in: opts.locationIds } } },
      data: { status: "AVAILABLE" },
    });
    await tx.locationAvailabilityRelease.create({
      data: {
        actorUserId: opts.actorUserId,
        locationIds: opts.locationIds,
        fromDate: new Date(`${opts.from}T00:00:00.000Z`),
        toDate: new Date(`${opts.to}T00:00:00.000Z`),
        reason: opts.reason,
        affectedJson: preview,
      },
    });
  });

  return {
    releasedWindows: windowIds.length,
    locationIds: opts.locationIds,
    preview,
  };
}

export { BLOCKING };
