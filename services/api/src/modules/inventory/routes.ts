import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import {
  createInventoryBodySchema,
  createRateCardBodySchema,
  importInventoryBatchBodySchema,
  updateInventoryBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import {
  OrganizationType,
  OrganizationStatus,
  SurveyStatus,
  ScoreStatus,
  UserRole,
  maybeVendorRate,
} from "@skyarc/shared";
import argon2 from "argon2";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { canAccessLocation, canWriteLocation, isReadOnly, isVendorUser, isInternalUser } from "../../lib/rbac.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { invalidateLocationCaches } from "../../lib/cache/location-cache.js";

function estimateScore(sqft: number, lightingType?: string | null): number {
  let score = 58;
  if (sqft >= 400) score += 18;
  else if (sqft >= 300) score += 12;
  else if (sqft >= 200) score += 6;

  const light = (lightingType ?? "").toLowerCase();
  if (light.includes("back") || light === "bl") score += 10;
  if (light.includes("front") || light === "fl") score += 4;

  return Math.min(94, score);
}

function feetToMm(ft: number): number {
  return Math.round(ft * 304.8);
}

function serializeInventory(
  inv: {
    id: string;
    screenId: string;
    inventoryType: string;
    productCode: string;
    notes: string | null;
    status: string;
    staticSpecsJson: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  latestRate?: {
    id: string;
    inventoryId: string;
    currency: string;
    period: string;
    amount: unknown;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    provenance: string;
    createdAt: Date;
    updatedAt: Date;
  } | null,
  user?: Parameters<typeof maybeVendorRate>[0],
  organizationId?: string | null
) {
  const base = {
    id: inv.id,
    screenId: inv.screenId,
    inventoryType: inv.inventoryType,
    productCode: inv.productCode,
    notes: inv.notes,
    status: inv.status,
    staticSpecsJson: inv.staticSpecsJson,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
  };

  if (!user || !latestRate) return base;

  const rate = maybeVendorRate(user, { organizationId: organizationId ?? null }, {
    id: latestRate.id,
    inventoryId: latestRate.inventoryId,
    currency: latestRate.currency,
    period: latestRate.period,
    amount: Number(latestRate.amount),
    effectiveFrom: latestRate.effectiveFrom.toISOString(),
    effectiveTo: latestRate.effectiveTo?.toISOString() ?? null,
    provenance: latestRate.provenance,
    createdAt: latestRate.createdAt.toISOString(),
    updatedAt: latestRate.updatedAt.toISOString(),
  });

  return {
    ...base,
    ...(rate ? { latestRate: rate } : {}),
  };
}

function serializeRateCard(card: {
  id: string;
  inventoryId: string;
  currency: string;
  period: string;
  amount: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  provenance: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: card.id,
    inventoryId: card.inventoryId,
    currency: card.currency,
    period: card.period,
    amount: Number(card.amount),
    effectiveFrom: card.effectiveFrom.toISOString(),
    effectiveTo: card.effectiveTo?.toISOString() ?? null,
    provenance: card.provenance,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

async function loadScreenWithLocation(screenId: string) {
  const screen = await prisma.screen.findUnique({
    where: { id: screenId },
    include: { location: true },
  });
  if (!screen) throw notFound("Screen not found");
  return screen;
}

async function loadInventoryWithLocation(inventoryId: string) {
  const inventory = await prisma.inventory.findUnique({
    where: { id: inventoryId },
    include: { screen: { include: { location: true } } },
  });
  if (!inventory) throw notFound("Inventory not found");
  return inventory;
}

export async function inventoryRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/screens/:id/inventories",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const screenId = uuidSchema.parse((request.params as { id: string }).id);
      const screen = await loadScreenWithLocation(screenId);
      if (!canAccessLocation(request.user, screen.location)) throw forbidden();

      const inventories = await prisma.inventory.findMany({
        where: { screenId },
        include: {
          rateCards: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      });

      const orgId = screen.location.organizationId;

      return success(
        inventories.map((inv) =>
          serializeInventory(
            inv,
            inv.rateCards[0] ?? null,
            request.user,
            orgId
          )
        )
      );
    }
  );

  fastify.post(
    "/screens/:id/inventories",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const screenId = uuidSchema.parse((request.params as { id: string }).id);
      const screen = await loadScreenWithLocation(screenId);
      if (!canWriteLocation(request.user, screen.location) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const body = createInventoryBodySchema.parse(request.body);
      const inventory = await prisma.inventory.create({
        data: {
          screenId,
          inventoryType: body.inventoryType,
          productCode: body.productCode,
          notes: body.notes,
          status: body.status,
          staticSpecsJson: body.staticSpecsJson as Prisma.InputJsonValue | undefined,
        },
      });
      return success(serializeInventory(inventory));
    }
  );

  fastify.patch(
    "/inventories/:id",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const inventory = await loadInventoryWithLocation(id);
      if (
        !canWriteLocation(request.user, inventory.screen.location) ||
        isReadOnly(request.user)
      ) {
        throw forbidden();
      }

      const body = updateInventoryBodySchema.parse(request.body);
      const updated = await prisma.inventory.update({
        where: { id },
        data: {
          ...body,
          staticSpecsJson: body.staticSpecsJson as Prisma.InputJsonValue | undefined,
        },
      });
      return success(serializeInventory(updated));
    }
  );

  fastify.delete(
    "/inventories/:id",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const inventory = await loadInventoryWithLocation(id);
      if (
        !canWriteLocation(request.user, inventory.screen.location) ||
        isReadOnly(request.user)
      ) {
        throw forbidden();
      }

      await prisma.inventory.delete({ where: { id } });
      return success({ deleted: true, id });
    }
  );

  fastify.get(
    "/inventories/:id/rate-cards",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const inventory = await loadInventoryWithLocation(id);
      if (!canAccessLocation(request.user, inventory.screen.location)) {
        throw forbidden();
      }

      const cards = await prisma.rateCard.findMany({
        where: { inventoryId: id },
        orderBy: { effectiveFrom: "desc" },
      });

      const orgId = inventory.screen.location.organizationId;
      const visible = maybeVendorRate(
        request.user,
        { organizationId: orgId },
        cards[0] ? serializeRateCard(cards[0]) : null
      );

      if (!visible && request.user.organizationId !== orgId) {
        return success([]);
      }

      return success(cards.map(serializeRateCard));
    }
  );

  fastify.post(
    "/inventories/:id/rate-cards",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const inventory = await loadInventoryWithLocation(id);
      if (
        !canWriteLocation(request.user, inventory.screen.location) ||
        isReadOnly(request.user)
      ) {
        throw forbidden();
      }

      const body = createRateCardBodySchema.parse(request.body);
      const card = await prisma.rateCard.create({
        data: {
          inventoryId: id,
          currency: body.currency,
          period: body.period,
          amount: body.amount,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
          effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        },
      });
      return success(serializeRateCard(card));
    }
  );

  fastify.post(
    "/inventories/import-batch",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (isReadOnly(request.user)) throw forbidden();
      const body = importInventoryBatchBodySchema.parse(request.body);

      let targetOrgId: string | null = null;
      let vendorUserCreated: {
        id: string;
        name: string;
        email: string;
        tempPassword?: string;
        isNewOrg: boolean;
      } | null = null;

      if (isVendorUser(request.user)) {
        if (!request.user.organizationId) throw forbidden("No vendor organization assigned");
        targetOrgId = request.user.organizationId;
      } else if (isInternalUser(request.user)) {
        if (body.vendorOrgName?.trim()) {
          const orgName = body.vendorOrgName.trim();
          const org = await prisma.organization.findFirst({
            where: { name: { equals: orgName, mode: "insensitive" } },
          });

          if (org) {
            targetOrgId = org.id;
          } else {
            // Automatically create new Vendor Organization
            const createdOrg = await prisma.organization.create({
              data: {
                name: orgName,
                type: OrganizationType.VENDOR,
                status: OrganizationStatus.ACTIVE,
                commercialJson: {
                  defaultRateAmount: 50000,
                  ratePeriod: "monthly",
                  paymentTermsDays: 30,
                  currency: "INR",
                },
              },
            });
            targetOrgId = createdOrg.id;

            // Generate default setup user for this new agency
            const cleanSlug = orgName.toLowerCase().replace(/[^a-z0-9]/g, "");
            const userEmail = body.vendorAdminEmail?.trim() || `${cleanSlug || "vendor"}@skyarcads.com`;
            const defaultPassword = "VendorPassword123!";

            // Check if user with this email already exists
            const existingUser = await prisma.user.findUnique({
              where: { email: userEmail },
            });

            if (!existingUser) {
              const passwordHash = await argon2.hash(defaultPassword);
              const newUser = await prisma.user.create({
                data: {
                  email: userEmail,
                  name: `${orgName} Admin`,
                  passwordHash,
                  role: UserRole.VENDOR,
                  organizationId: createdOrg.id,
                },
              });

              vendorUserCreated = {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                tempPassword: defaultPassword,
                isNewOrg: true,
              };
            }
          }
        } else {
          targetOrgId = request.user.organizationId;
        }
      } else {
        throw forbidden();
      }

      const activeScoringConfig = await prisma.scoringConfig.findFirst({
        where: { isActive: true },
      });

      let importedCount = 0;
      let updatedCount = 0;

      for (const item of body.items) {
        let existingLoc: { id: string; organizationId: string | null } | null = null;

        if (item.iid) {
          const attr = await prisma.locationAttribute.findFirst({
            where: {
              key: "inventory_iid",
              valueJson: { equals: item.iid },
            },
            select: { locationId: true },
          });
          if (attr?.locationId) {
            existingLoc = await prisma.location.findUnique({
              where: { id: attr.locationId },
              select: { id: true, organizationId: true },
            });
          }
        }

        if (!existingLoc) {
          existingLoc = await prisma.location.findFirst({
            where: {
              name: item.name,
              ...(targetOrgId ? { organizationId: targetOrgId } : {}),
            },
            select: { id: true, organizationId: true },
          });
        }

        const sqftVal = item.sqft ?? (item.widthFt && item.heightFt ? item.widthFt * item.heightFt : 200);
        const rateAmount = item.cardRateAmount ?? item.discountedRateAmount ?? Math.max(15000, Math.round(sqftVal * 80));

        if (existingLoc) {
          await prisma.location.update({
            where: { id: existingLoc.id },
            data: {
              latitude: item.latitude,
              longitude: item.longitude,
              road: item.area ?? undefined,
              address: item.locationDescription ?? undefined,
              commercialJson: {
                defaultRateAmount: rateAmount,
                ratePeriod: item.ratePeriod ?? "monthly",
              },
            },
          });

          const screen = await prisma.screen.findFirst({
            where: { locationId: existingLoc.id },
            include: { inventories: true },
          });

          if (screen?.inventories[0]) {
            await prisma.inventory.update({
              where: { id: screen.inventories[0].id },
              data: {
                inventoryType: item.mediaType,
                notes: item.locationDescription,
                staticSpecsJson: {
                  widthFt: item.widthFt,
                  heightFt: item.heightFt,
                  sqft: sqftVal,
                  lightingType: item.lightingType,
                  availableFrom: item.availableFrom,
                },
              },
            });

            await prisma.rateCard.create({
              data: {
                inventoryId: screen.inventories[0].id,
                currency: "INR",
                period: item.ratePeriod ?? "monthly",
                amount: rateAmount,
                effectiveFrom: new Date(),
                provenance: "USER_PROVIDED",
              },
            });
          }

          invalidateLocationCaches(existingLoc.id);
          updatedCount++;
        } else {
          const newLoc = await prisma.location.create({
            data: {
              name: item.name,
              latitude: item.latitude,
              longitude: item.longitude,
              road: item.area,
              address: item.locationDescription,
              surveyStatus: SurveyStatus.SUBMITTED,
              organizationId: targetOrgId,
              createdByUserId: request.user.id,
              commercialJson: {
                defaultRateAmount: rateAmount,
                ratePeriod: item.ratePeriod ?? "monthly",
              },
              skyarcCommercialJson: {
                clientRateAmount: Math.round(rateAmount * 1.25),
                ratePeriod: item.ratePeriod ?? "monthly",
                currency: "INR",
              },
              attributes: {
                create: [
                  ...(item.iid
                    ? [
                        {
                          key: "inventory_iid",
                          valueJson: item.iid,
                          provenance: "USER_PROVIDED" as const,
                          source: "excel_import",
                        },
                      ]
                    : []),
                  ...(item.lightingType
                    ? [
                        {
                          key: "lighting_type",
                          valueJson: item.lightingType,
                          provenance: "USER_PROVIDED" as const,
                          source: "excel_import",
                        },
                      ]
                    : []),
                  {
                    key: "sqft",
                    valueJson: sqftVal,
                    provenance: "USER_PROVIDED" as const,
                    source: "excel_import",
                  },
                ],
              },
              screens: {
                create: {
                  label: item.iid ?? item.name,
                  inventoryStatus: "AVAILABLE",
                  specification: item.widthFt && item.heightFt
                    ? {
                        create: {
                          widthMm: feetToMm(item.widthFt),
                          heightMm: feetToMm(item.heightFt),
                          aspectRatio: `${item.widthFt}:${item.heightFt}`,
                        },
                      }
                    : undefined,
                  inventories: {
                    create: {
                      productCode: item.iid ?? `INV-${Math.floor(1000 + Math.random() * 9000)}`,
                      inventoryType: item.mediaType,
                      status: "AVAILABLE",
                      notes: item.locationDescription,
                      staticSpecsJson: {
                        widthFt: item.widthFt,
                        heightFt: item.heightFt,
                        sqft: sqftVal,
                        lightingType: item.lightingType,
                        availableFrom: item.availableFrom,
                      },
                      rateCards: {
                        create: {
                          currency: "INR",
                          period: item.ratePeriod ?? "monthly",
                          amount: rateAmount,
                          effectiveFrom: new Date(),
                          provenance: "USER_PROVIDED",
                        },
                      },
                    },
                  },
                },
              },
              survey: {
                create: {
                  checklist: { importedFrom: "excel_sheet", timestamp: new Date().toISOString() },
                  freeTextObservation: item.locationDescription,
                  syncState: "UPLOADED",
                },
              },
            },
          });

          if (activeScoringConfig) {
            await prisma.locationScore.create({
              data: {
                locationId: newLoc.id,
                scoringConfigId: activeScoringConfig.id,
                overallScore: estimateScore(sqftVal, item.lightingType),
                overallConfidence: 0.75,
                status: ScoreStatus.COMPUTED,
                componentsJson: {
                  source: "excel_batch_import",
                  sqft: sqftVal,
                  lighting: item.lightingType,
                },
                computedAt: new Date(),
              },
            });
          }

          invalidateLocationCaches(newLoc.id);
          importedCount++;
        }
      }

      return success({
        total: body.items.length,
        created: importedCount,
        updated: updatedCount,
        organizationId: targetOrgId,
        vendorUserCreated,
      });
    }
  );
}
