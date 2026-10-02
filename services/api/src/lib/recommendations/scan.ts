/**
 * Scan authoritative Atlas records for continuity disruptions and fill-rate vacancies.
 * Never infers screen outages from missing Orbit telemetry.
 */

import type { PrismaClient } from "@prisma/client";
import {
  customerRateForInventory,
  flightCostFromStoredRate,
  ratePeriodForInventory,
} from "../media-planning/rates.js";
import { resolveOrganizationMarginPercent } from "../commercial-config.js";
import {
  disruptionFromBlockedLaunch,
  disruptionFromOpsIncident,
  disruptionFromRejectedItem,
} from "./continuity-detect.js";
import { suggestContinuityReplacements } from "./replacements.js";
import { suggestFillRatePackages } from "./fill-rate.js";
import { markExpiredOpen, upsertRecommendation } from "./persist.js";

type Db = PrismaClient;

const candidateInclude = {
  availabilityWindows: true,
  rateCards: { take: 1, orderBy: { effectiveFrom: "desc" as const } },
  screen: {
    include: {
      location: {
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          skyarcSiteCode: true,
          skyarcCommercialJson: true,
          organizationId: true,
        },
      },
    },
  },
} as const;

export async function scanContinuityDisruptions(
  db: Db,
  opts?: { tenantOrganizationId?: string | null; actorUserId?: string | null }
) {
  await markExpiredOpen(db);

  const disruptions = [];

  // 1) Vendor rejections
  const rejected = await db.bookingItem.findMany({
    where: {
      status: "REJECTED",
      booking: {
        status: { notIn: ["CANCELLED", "EXPIRED"] },
        ...(opts?.tenantOrganizationId
          ? { tenantOrganizationId: opts.tenantOrganizationId }
          : {}),
      },
    },
    include: {
      booking: true,
      inventory: {
        include: {
          screen: { include: { location: { select: { id: true, city: true } } } },
        },
      },
    },
    take: 100,
  });

  for (const item of rejected) {
    disruptions.push(
      disruptionFromRejectedItem({
        campaignId: item.booking.campaignId,
        bookingId: item.bookingId,
        bookingItemId: item.id,
        inventoryId: item.inventoryId,
        locationId: item.inventory.screen.location.id,
        inventoryType: item.inventory.inventoryType,
        city: item.inventory.screen.location.city,
      })
    );
  }

  // 2) Inventory became UNAVAILABLE while still on an active booking item
  const unavailableItems = await db.bookingItem.findMany({
    where: {
      status: { in: ["HELD", "CONFIRMED", "PENDING_VENDOR_APPROVAL"] },
      inventory: { status: "UNAVAILABLE" },
      booking: {
        status: { notIn: ["CANCELLED", "EXPIRED"] },
        ...(opts?.tenantOrganizationId
          ? { tenantOrganizationId: opts.tenantOrganizationId }
          : {}),
      },
    },
    include: {
      booking: true,
      inventory: {
        include: {
          screen: { include: { location: { select: { id: true, city: true } } } },
        },
      },
    },
    take: 100,
  });

  for (const item of unavailableItems) {
    disruptions.push({
      triggerType: "INVENTORY_UNAVAILABLE" as const,
      triggerKey: `continuity:inv_unavailable:${item.id}`,
      campaignId: item.booking.campaignId,
      bookingId: item.bookingId,
      bookingItemId: item.id,
      inventoryId: item.inventoryId,
      locationId: item.inventory.screen.location.id,
      inventoryType: item.inventory.inventoryType,
      city: item.inventory.screen.location.city,
      observedAt: new Date(),
      explanation:
        "Inventory status is UNAVAILABLE while booking item remains active — continuity replacement may be required.",
    });
  }

  // 3) Approved operational incidents (ISSUE_RESOLUTION / BLOCKED tasks with booking item)
  const incidents = await db.executionTask.findMany({
    where: {
      status: "BLOCKED",
      kind: { in: ["ISSUE_RESOLUTION", "LAUNCH_VERIFICATION"] },
      bookingItemId: { not: null },
      ...(opts?.tenantOrganizationId
        ? { tenantOrganizationId: opts.tenantOrganizationId }
        : {}),
    },
    include: {
      bookingItem: {
        include: {
          inventory: {
            include: {
              screen: { include: { location: { select: { id: true, city: true } } } },
            },
          },
        },
      },
    },
    take: 100,
  });

  for (const task of incidents) {
    if (!task.bookingItem) continue;
    const item = task.bookingItem;
    if (task.kind === "LAUNCH_VERIFICATION") {
      disruptions.push(
        disruptionFromBlockedLaunch({
          campaignId: task.campaignId,
          bookingId: task.bookingId,
          bookingItemId: item.id,
          inventoryId: item.inventoryId,
          locationId: item.inventory.screen.location.id,
          inventoryType: item.inventory.inventoryType,
          city: item.inventory.screen.location.city,
          blockedReason: task.blockedReason,
        })
      );
    } else {
      disruptions.push(
        disruptionFromOpsIncident({
          campaignId: task.campaignId,
          bookingId: task.bookingId,
          bookingItemId: item.id,
          inventoryId: item.inventoryId,
          locationId: item.inventory.screen.location.id,
          inventoryType: item.inventory.inventoryType,
          city: item.inventory.screen.location.city,
        })
      );
    }
  }

  const candidates = await db.inventory.findMany({
    where: { status: { in: ["AVAILABLE", "UNKNOWN"] } },
    include: candidateInclude,
    take: 500,
  });

  const mappedCandidates = candidates.map((inv) => ({
    ...inv,
    screenStatus: inv.screen.inventoryStatus ?? null,
    screen: {
      locationId: inv.screen.locationId,
      location: {
        ...inv.screen.location,
        name: inv.screen.location.name,
      },
    },
  }));

  const results = [];
  for (const d of disruptions) {
    const booking = await db.booking.findUnique({ where: { id: d.bookingId } });
    if (!booking) continue;

    const originalInv = await db.inventory.findUnique({
      where: { id: d.inventoryId },
      include: {
        rateCards: { take: 1, orderBy: { effectiveFrom: "desc" } },
        screen: { include: { location: { select: { skyarcCommercialJson: true } } } },
      },
    });
    const originalRate = originalInv ? customerRateForInventory(originalInv) : 0;
    const originalPeriod = originalInv ? ratePeriodForInventory(originalInv) : "monthly";
    const originalFlight =
      originalRate > 0
        ? flightCostFromStoredRate({
            rateAmount: originalRate,
            ratePeriod: originalPeriod,
            startDate: booking.startDate,
            endDate: booking.endDate,
          })
        : 0;

    const suggestions = suggestContinuityReplacements(mappedCandidates, {
      inventoryId: d.inventoryId,
      inventoryType: d.inventoryType,
      city: d.city,
      locationId: d.locationId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      originalRateAmount: originalRate,
      originalFlightCost: originalFlight,
      excludeInventoryIds: [d.inventoryId],
    });

    const upserted = await upsertRecommendation(db, {
      tenantOrganizationId: booking.tenantOrganizationId,
      kind: "CONTINUITY_REPLACEMENT",
      method: "DETERMINISTIC_RULE",
      triggerKey: d.triggerKey,
      triggerType: d.triggerType,
      campaignId: d.campaignId,
      bookingId: d.bookingId,
      bookingItemId: d.bookingItemId,
      observedAt: d.observedAt,
      inputSnapshot: {
        disruption: d,
        originalRate,
        originalFlightCost: originalFlight,
        flight: {
          startDate: booking.startDate.toISOString(),
          endDate: booking.endDate.toISOString(),
        },
      },
      suggestions,
      explanation: d.explanation,
      pricingAvailable: suggestions.every((s) => s.pricingAvailable) && suggestions.length > 0,
      costDataComplete: false,
      marginSuppressed: true,
      actorUserId: opts?.actorUserId,
    });
    results.push(upserted);
  }

  return { scanned: disruptions.length, upserts: results };
}

export async function scanFillRateVacancies(
  db: Db,
  opts?: {
    tenantOrganizationId?: string | null;
    actorUserId?: string | null;
    daysAhead?: number;
    windowDays?: number;
  }
) {
  await markExpiredOpen(db);

  const daysAhead = opts?.daysAhead ?? 7;
  const windowDays = opts?.windowDays ?? 14;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + daysAhead);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + windowDays - 1);

  const marginPercent = await resolveOrganizationMarginPercent(
    opts?.tenantOrganizationId ?? null
  );

  const inventories = await db.inventory.findMany({
    where: { status: { in: ["AVAILABLE", "UNKNOWN"] } },
    include: candidateInclude,
    take: 500,
  });

  // Confirmed vendor costs from CampaignExpense with costMissing=false for attribution inventory:*
  const expenses = await db.campaignExpense.findMany({
    where: {
      costMissing: false,
      attributionKey: { startsWith: "inventory:" },
      ...(opts?.tenantOrganizationId
        ? { tenantOrganizationId: opts.tenantOrganizationId }
        : {}),
    },
    select: { attributionKey: true, incurredMinor: true, expectedMinor: true, committedMinor: true },
    take: 1000,
  });
  const costByInventory = new Map<string, number>();
  for (const e of expenses) {
    const invId = e.attributionKey.replace(/^inventory:/, "");
    const minor = e.incurredMinor || e.committedMinor || e.expectedMinor;
    if (minor > 0) costByInventory.set(invId, minor);
  }

  const mapped = inventories.map((inv) => ({
    ...inv,
    screenStatus: inv.screen.inventoryStatus ?? null,
    confirmedVendorCost: costByInventory.has(inv.id)
      ? (costByInventory.get(inv.id) ?? 0) / 100
      : null,
    screen: {
      locationId: inv.screen.locationId,
      location: inv.screen.location,
    },
  }));

  const packages = suggestFillRatePackages(mapped, {
    vacancy: { startDate: start, endDate: end },
    minMarginPercent: marginPercent > 0 ? marginPercent : undefined,
    maxFaces: 3,
  });

  const results = [];
  for (const pkg of packages) {
    const city = pkg.faces[0]?.city ?? "unknown";
    const triggerKey = `fillrate:${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}:${city.toLowerCase()}:${pkg.inventoryIds.slice().sort().join(",")}`;

    const upserted = await upsertRecommendation(db, {
      tenantOrganizationId: opts?.tenantOrganizationId ?? null,
      kind: "FILL_RATE_PACKAGE",
      method: pkg.method,
      triggerKey,
      triggerType: "UPCOMING_VACANCY",
      observedAt: new Date(),
      inputSnapshot: {
        vacancy: { start: pkg.vacancyStart, end: pkg.vacancyEnd },
        minMarginPercent: marginPercent,
        note: "Does not change published prices or issue customer offers",
      },
      suggestions: [pkg],
      explanation: pkg.explanation,
      pricingAvailable: pkg.pricingAvailable,
      costDataComplete: pkg.costDataComplete,
      marginSuppressed: pkg.marginSuppressed,
      actorUserId: opts?.actorUserId,
    });
    results.push(upserted);
  }

  return { packages: packages.length, upserts: results, vacancy: { start, end } };
}
