/**
 * Phase 7A — Staff commercial recommendation queue (continuity + fill-rate).
 * Atlas owns records; Pulse may orchestrate notifications via Bridge.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuidSchema } from "@skyarc/validation";
import { isInternalUser, isVendorUser } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canWriteCampaigns } from "../../lib/rbac.js";
import { assertSameTenant, requireTenantUnlessInternal } from "../../lib/tenant-context.js";
import { scanContinuityDisruptions, scanFillRateVacancies } from "../../lib/recommendations/scan.js";
import {
  approveRecommendation,
  applyContinuityReplacement,
  dismissRecommendation,
} from "../../lib/recommendations/apply.js";
import {
  defaultExpiry,
  isRecommendationStale,
  markExpiredOpen,
} from "../../lib/recommendations/persist.js";
import {
  serializeRecommendationCustomer,
  serializeRecommendationStaff,
} from "../../lib/recommendations/serialize.js";
import { suggestContinuityReplacements } from "../../lib/recommendations/replacements.js";
import {
  customerRateForInventory,
  flightCostFromStoredRate,
  ratePeriodForInventory,
} from "../../lib/media-planning/rates.js";
import type { AuthUser } from "../../lib/rbac.js";
import { RULE_VERSION } from "../../lib/recommendations/continuity-detect.js";

function requireStaff(user: AuthUser) {
  if (!isInternalUser(user) || isVendorUser(user)) throw forbidden();
}

export async function recommendationRoutes(fastify: FastifyInstance) {
  fastify.get("/recommendations", { preHandler: [fastify.authenticate] }, async (request) => {
    requireStaff(request.user);
    await markExpiredOpen(prisma);
    const q = z
      .object({
        kind: z.enum(["CONTINUITY_REPLACEMENT", "FILL_RATE_PACKAGE"]).optional(),
        status: z
          .enum(["OPEN", "APPROVED", "DISMISSED", "APPLIED", "EXPIRED", "SUPERSEDED", "FAILED"])
          .optional(),
        campaignId: z.string().uuid().optional(),
      })
      .parse(request.query ?? {});

    const tenantId = requireTenantUnlessInternal(request.user);
    const rows = await prisma.commercialRecommendation.findMany({
      where: {
        ...(tenantId ? { tenantOrganizationId: tenantId } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.status ? { status: q.status } : { status: { in: ["OPEN", "APPROVED", "FAILED"] } }),
        ...(q.campaignId ? { campaignId: q.campaignId } : {}),
      },
      orderBy: [{ status: "asc" }, { observedAt: "desc" }],
      take: 100,
    });

    const continuity = rows.filter((r) => r.kind === "CONTINUITY_REPLACEMENT");
    const fillRate = rows.filter((r) => r.kind === "FILL_RATE_PACKAGE");
    const missingData = rows.filter((r) => !r.pricingAvailable || r.marginSuppressed);

    return success({
      recommendations: rows.map(serializeRecommendationStaff),
      queue: {
        campaignDisruptions: continuity.map(serializeRecommendationStaff),
        fillRatePackages: fillRate.map(serializeRecommendationStaff),
        missingDataWarnings: missingData.map((r) => ({
          id: r.id,
          kind: r.kind,
          pricingAvailable: r.pricingAvailable,
          marginSuppressed: r.marginSuppressed,
          costDataComplete: r.costDataComplete,
        })),
      },
      ruleVersion: RULE_VERSION,
      note: "Staff-only. Recommendations do not reserve capacity or issue customer offers.",
    });
  });

  fastify.get("/recommendations/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const row = await prisma.commercialRecommendation.findUnique({ where: { id } });
    if (!row) throw notFound("Recommendation not found");
    assertSameTenant(request.user, row.tenantOrganizationId);

    if (isInternalUser(request.user)) {
      return success({ recommendation: serializeRecommendationStaff(row) });
    }
    // Clients may see sanitized continuity notices only — never margins/costs
    if (row.kind === "CONTINUITY_REPLACEMENT" && ["OPEN", "APPROVED", "APPLIED"].includes(row.status)) {
      return success({ recommendation: serializeRecommendationCustomer(row) });
    }
    throw forbidden();
  });

  fastify.post("/recommendations/scan", { preHandler: [fastify.authenticate] }, async (request) => {
    requireStaff(request.user);
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const body = z
      .object({
        continuity: z.boolean().optional().default(true),
        fillRate: z.boolean().optional().default(true),
        daysAhead: z.number().int().min(0).max(90).optional(),
        windowDays: z.number().int().min(1).max(90).optional(),
      })
      .parse(request.body ?? {});

    const tenantId = requireTenantUnlessInternal(request.user);
    const continuity = body.continuity
      ? await scanContinuityDisruptions(prisma, {
          tenantOrganizationId: tenantId,
          actorUserId: request.user.id,
        })
      : { scanned: 0, upserts: [] };
    const fillRate = body.fillRate
      ? await scanFillRateVacancies(prisma, {
          tenantOrganizationId: tenantId,
          actorUserId: request.user.id,
          daysAhead: body.daysAhead,
          windowDays: body.windowDays,
        })
      : { packages: 0, upserts: [], vacancy: null };

    return success({
      continuity: {
        scanned: continuity.scanned,
        written: continuity.upserts.filter((u) => !u.skipped).length,
        reconciled: continuity.upserts.filter((u) => u.reconciled).length,
      },
      fillRate: {
        packages: fillRate.packages,
        written: fillRate.upserts.filter((u) => !u.skipped).length,
        vacancy: fillRate.vacancy
          ? {
              start: fillRate.vacancy.start.toISOString(),
              end: fillRate.vacancy.end.toISOString(),
            }
          : null,
      },
      note: "Scan does not reserve capacity. Apply requires authorized approval + revalidation.",
    });
  });

  fastify.post("/recommendations/:id/recalculate", { preHandler: [fastify.authenticate] }, async (request) => {
    requireStaff(request.user);
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const row = await prisma.commercialRecommendation.findUnique({ where: { id } });
    if (!row) throw notFound("Recommendation not found");
    assertSameTenant(request.user, row.tenantOrganizationId);
    if (row.status === "APPLIED") {
      throw validationError("Cannot recalculate an applied recommendation — create a new scan trigger");
    }

    if (row.kind === "CONTINUITY_REPLACEMENT" && row.bookingId && row.bookingItemId) {
      const booking = await prisma.booking.findUnique({ where: { id: row.bookingId } });
      const item = await prisma.bookingItem.findUnique({
        where: { id: row.bookingItemId },
        include: {
          inventory: {
            include: {
              rateCards: { take: 1, orderBy: { effectiveFrom: "desc" } },
              screen: {
                include: {
                  location: {
                    select: { id: true, city: true, skyarcCommercialJson: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!booking || !item) throw validationError("Linked booking/item missing");

      const candidates = await prisma.inventory.findMany({
        where: { status: { in: ["AVAILABLE", "UNKNOWN"] } },
        include: {
          availabilityWindows: true,
          rateCards: { take: 1, orderBy: { effectiveFrom: "desc" } },
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
                },
              },
            },
          },
        },
        take: 500,
      });

      const originalRate = customerRateForInventory(item.inventory);
      const originalFlight =
        originalRate > 0
          ? flightCostFromStoredRate({
              rateAmount: originalRate,
              ratePeriod: ratePeriodForInventory(item.inventory),
              startDate: booking.startDate,
              endDate: booking.endDate,
            })
          : 0;

      const suggestions = suggestContinuityReplacements(
        candidates.map((inv) => ({
          ...inv,
          screenStatus: inv.screen.inventoryStatus ?? null,
          screen: {
            locationId: inv.screen.locationId,
            location: inv.screen.location,
          },
        })),
        {
          inventoryId: item.inventoryId,
          inventoryType: item.inventory.inventoryType,
          city: item.inventory.screen.location.city,
          locationId: item.inventory.screen.location.id,
          startDate: booking.startDate,
          endDate: booking.endDate,
          originalRateAmount: originalRate,
          originalFlightCost: originalFlight,
        }
      );

      const refreshed = await prisma.commercialRecommendation.update({
        where: { id: row.id },
        data: {
          status: "OPEN",
          method: "DETERMINISTIC_RULE",
          ruleVersion: RULE_VERSION,
          observedAt: new Date(),
          expiresAt: defaultExpiry(),
          freshnessLabel: "fresh",
          pricingAvailable: suggestions.length > 0 && suggestions.every((s) => s.pricingAvailable),
          suggestionsJson: suggestions,
          inputSnapshotJson: {
            recalculated: true,
            originalRate,
            originalFlightCost: originalFlight,
          },
          reviewedAt: null,
          reviewedByUserId: null,
          actionHistoryJson: [
            ...((Array.isArray(row.actionHistoryJson)
              ? row.actionHistoryJson
              : []) as object[]),
            {
              at: new Date().toISOString(),
              action: "recalculate",
              actorUserId: request.user.id,
            },
          ],
          updatedAt: new Date(),
        },
      });

      return success({
        recommendation: serializeRecommendationStaff(refreshed),
        note: "Recalculated against current capacity and rates — prior approval cleared",
      });
    }

    // Fill-rate: re-run vacancy scan for tenant (broader refresh)
    const tenantId = row.tenantOrganizationId;
    await scanFillRateVacancies(prisma, {
      tenantOrganizationId: tenantId,
      actorUserId: request.user.id,
    });
    const latest = await prisma.commercialRecommendation.findUnique({ where: { id } });
    if (!latest) throw notFound("Recommendation not found after recalculate");
    return success({
      recommendation: serializeRecommendationStaff(latest),
      note: isRecommendationStale(latest)
        ? "Fill-rate row may have been superseded — check queue for fresh packages"
        : "Fill-rate scan refreshed",
    });
  });

  fastify.post("/recommendations/:id/approve", { preHandler: [fastify.authenticate] }, async (request) => {
    requireStaff(request.user);
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const row = await prisma.commercialRecommendation.findUnique({ where: { id } });
    if (!row) throw notFound("Recommendation not found");
    assertSameTenant(request.user, row.tenantOrganizationId);
    const result = await approveRecommendation(prisma, id, request.user.id);
    if ("error" in result) throw validationError(result.error ?? "Approve failed");
    return success({
      recommendation: serializeRecommendationStaff(result.recommendation),
      note: "Approved — apply still requires explicit action and revalidation",
    });
  });

  fastify.post("/recommendations/:id/dismiss", { preHandler: [fastify.authenticate] }, async (request) => {
    requireStaff(request.user);
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});
    const row = await prisma.commercialRecommendation.findUnique({ where: { id } });
    if (!row) throw notFound("Recommendation not found");
    assertSameTenant(request.user, row.tenantOrganizationId);
    const result = await dismissRecommendation(prisma, id, request.user.id, body.reason);
    if ("error" in result) throw validationError(result.error ?? "Dismiss failed");
    return success({ recommendation: serializeRecommendationStaff(result.recommendation) });
  });

  fastify.post("/recommendations/:id/apply", { preHandler: [fastify.authenticate] }, async (request) => {
    requireStaff(request.user);
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const body = z
      .object({ chosenInventoryId: z.string().uuid() })
      .parse(request.body ?? {});
    const row = await prisma.commercialRecommendation.findUnique({ where: { id } });
    if (!row) throw notFound("Recommendation not found");
    assertSameTenant(request.user, row.tenantOrganizationId);

    const result = await applyContinuityReplacement(prisma, {
      recommendationId: id,
      chosenInventoryId: body.chosenInventoryId,
      actorUserId: request.user.id,
    });
    if ("error" in result) throw validationError(result.error ?? "Apply failed");
    return success({
      recommendation: serializeRecommendationStaff(result.recommendation!),
      change: result.change,
      bookingId: row.bookingId,
      note: result.change?.revisedCommercialTerms
        ? "Booking amended with revised commercial terms after price revalidation"
        : "Booking amended after availability and price revalidation",
    });
  });
}
