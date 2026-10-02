/**
 * Shared helpers for Postgres integration tests.
 * Requires INTEGRATION_DATABASE_URL — never falls back to DATABASE_URL silently.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe } from "vitest";

export function integrationDatabaseUrl(): string | null {
  const url = process.env.INTEGRATION_DATABASE_URL?.trim();
  return url || null;
}

export function describeIntegration(name: string, fn: () => void) {
  const url = integrationDatabaseUrl();
  if (!url) {
    describe.skip(`${name} (set INTEGRATION_DATABASE_URL)`, fn);
    return;
  }
  describe(name, fn);
}

export function createIntegrationPrisma(): PrismaClient {
  const url = integrationDatabaseUrl();
  if (!url) {
    throw new Error("INTEGRATION_DATABASE_URL is required for integration tests");
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

export type FixtureIds = {
  orgA: string;
  orgB: string;
  locationA: string;
  locationB: string;
  screenA: string;
  inventoryA: string;
  inventoryDigital: string;
  advertiser: string;
  campaignA: string;
  campaignB: string;
  userA: string;
};

/** Ephemeral fixture set tagged with a run id for safe cleanup. */
export async function seedReservationFixture(prisma: PrismaClient): Promise<FixtureIds> {
  const tag = `it-${randomUUID().slice(0, 8)}`;
  const ids: FixtureIds = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    locationA: randomUUID(),
    locationB: randomUUID(),
    screenA: randomUUID(),
    inventoryA: randomUUID(),
    inventoryDigital: randomUUID(),
    advertiser: randomUUID(),
    campaignA: randomUUID(),
    campaignB: randomUUID(),
    userA: randomUUID(),
  };

  await prisma.organization.create({
    data: {
      id: ids.orgA,
      name: `${tag}-vendor-a`,
      type: "VENDOR",
      status: "ACTIVE",
    },
  });
  await prisma.organization.create({
    data: {
      id: ids.orgB,
      name: `${tag}-vendor-b`,
      type: "VENDOR",
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      id: ids.userA,
      email: `${tag}@integration.test`,
      passwordHash: "x",
      name: "Integration User",
      role: "ADMIN",
      organizationId: ids.orgA,
    },
  });

  await prisma.location.create({
    data: {
      id: ids.locationA,
      name: `${tag}-loc-a`,
      latitude: 23.0,
      longitude: 72.5,
      organizationId: ids.orgA,
      createdByUserId: ids.userA,
      surveyStatus: "COMPLETED",
    },
  });
  await prisma.location.create({
    data: {
      id: ids.locationB,
      name: `${tag}-loc-b`,
      latitude: 23.1,
      longitude: 72.6,
      organizationId: ids.orgB,
      createdByUserId: ids.userA,
      surveyStatus: "COMPLETED",
    },
  });

  await prisma.screen.create({
    data: {
      id: ids.screenA,
      locationId: ids.locationA,
      label: `${tag}-screen`,
      inventoryStatus: "AVAILABLE",
      loopDurationSec: 60,
      slotDurationSec: 10,
    },
  });

  await prisma.inventory.create({
    data: {
      id: ids.inventoryA,
      screenId: ids.screenA,
      inventoryType: "STATIC_BILLBOARD",
      productCode: `${tag}-static`,
      status: "AVAILABLE",
      slotCapacity: 1,
    },
  });

  const screenDigital = randomUUID();
  await prisma.screen.create({
    data: {
      id: screenDigital,
      locationId: ids.locationA,
      label: `${tag}-digital`,
      inventoryStatus: "AVAILABLE",
      loopDurationSec: 60,
      slotDurationSec: 10,
    },
  });
  await prisma.inventory.create({
    data: {
      id: ids.inventoryDigital,
      screenId: screenDigital,
      inventoryType: "DIGITAL_BILLBOARD",
      productCode: `${tag}-digital`,
      status: "AVAILABLE",
      slotCapacity: 2,
    },
  });

  await prisma.rateCard.create({
    data: {
      inventoryId: ids.inventoryA,
      currency: "INR",
      period: "monthly",
      amount: 100_000,
      effectiveFrom: new Date("2026-01-01"),
      provenance: "UNKNOWN",
    },
  });
  await prisma.rateCard.create({
    data: {
      inventoryId: ids.inventoryDigital,
      currency: "INR",
      period: "monthly",
      amount: 150_000,
      effectiveFrom: new Date("2026-01-01"),
      provenance: "UNKNOWN",
    },
  });

  await prisma.advertiser.create({
    data: {
      id: ids.advertiser,
      name: `${tag}-advertiser`,
    },
  });

  const start = new Date("2026-11-01T00:00:00Z");
  const end = new Date("2026-11-14T00:00:00Z");
  await prisma.campaign.create({
    data: {
      id: ids.campaignA,
      name: `${tag}-campaign-a`,
      advertiserId: ids.advertiser,
      startDate: start,
      endDate: end,
      createdByUserId: ids.userA,
      lifecycleStatus: "DRAFT",
    },
  });
  await prisma.campaign.create({
    data: {
      id: ids.campaignB,
      name: `${tag}-campaign-b`,
      advertiserId: ids.advertiser,
      startDate: start,
      endDate: end,
      createdByUserId: ids.userA,
      lifecycleStatus: "DRAFT",
    },
  });

  return ids;
}

export async function cleanupFixture(prisma: PrismaClient, ids: FixtureIds) {
  const campaignIds = [ids.campaignA, ids.campaignB];
  await prisma.bookingChangeOutbox.deleteMany({
    where: { booking: { campaignId: { in: campaignIds } } },
  }).catch(() => undefined);
  await prisma.bookingTransition.deleteMany({
    where: { booking: { campaignId: { in: campaignIds } } },
  });
  await prisma.bookingItem.deleteMany({
    where: { booking: { campaignId: { in: campaignIds } } },
  });
  await prisma.booking.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.quoteRevision.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await prisma.availabilityWindow.deleteMany({
    where: { inventoryId: { in: [ids.inventoryA, ids.inventoryDigital] } },
  });
  await prisma.rateCard.deleteMany({
    where: { inventoryId: { in: [ids.inventoryA, ids.inventoryDigital] } },
  });
  await prisma.inventory.deleteMany({
    where: { id: { in: [ids.inventoryA, ids.inventoryDigital] } },
  });
  await prisma.screen.deleteMany({ where: { locationId: { in: [ids.locationA, ids.locationB] } } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  await prisma.advertiser.deleteMany({ where: { id: ids.advertiser } });
  await prisma.location.deleteMany({ where: { id: { in: [ids.locationA, ids.locationB] } } });
  await prisma.user.deleteMany({ where: { id: ids.userA } });
  await prisma.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } });
}

/** Convenience: wire prisma + fixture lifecycle for a describe block. */
export function useReservationFixture() {
  const prisma = createIntegrationPrisma();
  let fixture: FixtureIds;

  beforeAll(async () => {
    fixture = await seedReservationFixture(prisma);
  });

  afterAll(async () => {
    if (fixture) await cleanupFixture(prisma, fixture);
    await prisma.$disconnect();
  });

  return {
    prisma,
    get ids() {
      return fixture;
    },
  };
}
