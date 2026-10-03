/**
 * Slice 5 — idempotent demo inventory across Ahmedabad, Surat, and Vadodara.
 * Invoked from seed-full.ts after Rajkot catalog load.
 */
import { PrismaClient, ScoreStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  buildSkyarcSiteCode,
  listMarketCities,
  type MarketCity,
} from "@skyarc/shared";

type SeedDeps = {
  prisma: PrismaClient;
  brandalystOrgId: string;
  apexOrgId: string;
  adminUserId: string;
  scoringConfigId: string;
};

function feetToMm(ft: number): number {
  return Math.round(ft * 304.8);
}

function estimateScore(sqft: number): number {
  if (sqft >= 400) return 82;
  if (sqft >= 200) return 74;
  return 66;
}

const FACTOR_MAP: Record<string, string> = {
  visibility: "VISIBILITY",
  audience_fit: "AUDIENCE_FIT",
  commercial_fit: "COMMERCIAL_FIT",
  approach_exposure: "APPROACH_EXPOSURE",
  brand_suitability: "BRAND_SUITABILITY",
  visual_competition: "VISUAL_COMPETITION",
  location_quality: "LOCATION_QUALITY",
  data_confidence: "DATA_CONFIDENCE",
};

function scoreComponents(overall: number) {
  const factors = {
    visibility: overall,
    audience_fit: overall - 4,
    commercial_fit: overall - 6,
    approach_exposure: overall - 2,
    brand_suitability: overall - 3,
    visual_competition: 68,
    location_quality: overall - 5,
    data_confidence: 72,
  };
  return Object.entries(factors).map(([key, score]) => ({
    factor: FACTOR_MAP[key] ?? key.toUpperCase(),
    score,
    confidence: 0.72,
    status: ScoreStatus.COMPUTED,
    evidence: ["multi-city seed"],
  }));
}

type SiteTemplate = {
  corridor: string;
  invType: string;
  widthFt: number;
  heightFt: number;
  clientRate: number;
  premium?: boolean;
  vendorOnly?: boolean;
};

function templatesForCity(city: MarketCity): SiteTemplate[] {
  const corridors = city.corridors.slice(0, 6);
  return corridors.flatMap((corridor, index) => {
    const isPremium = index % 2 === 0;
    const vendorOnly = index % 3 === 0;
    const invType =
      index % 4 === 0
        ? "DIGITAL_BILLBOARD"
        : index % 4 === 1
          ? "UNIPOLE"
          : index % 4 === 2
            ? "STATIC_BILLBOARD"
            : "KIOSK";
    const sqft =
      invType === "KIOSK" ? 28 : invType === "UNIPOLE" ? 600 : invType === "DIGITAL_BILLBOARD" ? 240 : 180;
    const widthFt = invType === "KIOSK" ? 6 : invType === "UNIPOLE" ? 40 : 20;
    const heightFt = invType === "KIOSK" ? 4 : invType === "UNIPOLE" ? 20 : 10;
    const clientRate =
      invType === "DIGITAL_BILLBOARD"
        ? 120_000 + index * 15_000
        : invType === "UNIPOLE"
          ? 95_000 + index * 10_000
          : invType === "KIOSK"
            ? 32_000 + index * 4_000
            : 58_000 + index * 6_000;
    return [
      {
        corridor: corridor.name,
        invType,
        widthFt,
        heightFt,
        clientRate,
        premium: isPremium && (invType === "UNIPOLE" || invType === "DIGITAL_BILLBOARD"),
        vendorOnly,
      },
    ];
  });
}

export async function seedMultiCityMarkets(deps: SeedDeps): Promise<number> {
  const { prisma, brandalystOrgId, apexOrgId, adminUserId, scoringConfigId } = deps;
  const cities = listMarketCities().filter((city) => city.id !== "rajkot");
  let created = 0;

  for (const city of cities) {
    const templates = templatesForCity(city);
    for (let i = 0; i < templates.length; i++) {
      const row = templates[i]!;
      const seedKey = `${city.id}-${i + 1}`;
      const existing = await prisma.locationAttribute.findFirst({
        where: {
          key: "multi_city_seed_id",
          valueJson: { equals: seedKey },
        },
        select: { locationId: true },
      });

      const assignedOrg = i % 2 === 0 ? brandalystOrgId : apexOrgId;
      const sqft = row.widthFt * row.heightFt;
      const vendorRate = Math.round(row.clientRate / 1.28);
      const lat = city.center.lat + (i % 5) * 0.012 - 0.02;
      const lng = city.center.lng + (i % 4) * 0.015 - 0.02;
      const skyarcSiteCode =
        row.vendorOnly ? null : buildSkyarcSiteCode(city.id, i + 1);
      const locationName = `${city.name} — ${row.corridor}`;

      let locationId = existing?.locationId;
      if (!locationId) {
        locationId = randomUUID();
        await prisma.location.create({
          data: {
            id: locationId,
            skyarcSiteCode,
            vendorMediaCode: `VND-${city.siteCodePrefix}-${String(i + 1).padStart(2, "0")}`,
            name: locationName,
            latitude: lat,
            longitude: lng,
            road: row.corridor,
            junction: row.corridor,
            address: `${row.corridor}, ${city.name}`,
            city: city.name,
            district: city.district,
            state: city.state,
            organizationId: assignedOrg,
            createdByUserId: adminUserId,
            surveyStatus: "SUBMITTED",
            capturedAt: new Date(),
            skyarcCommercialJson: {
              clientRateAmount: row.clientRate,
              ratePeriod: "MONTHLY",
              currency: "INR",
              premium: row.premium === true,
              notes: `Demo ${city.name} corridor site`,
            },
            commercialJson: {
              marginPercent: 12,
              defaultRateAmount: vendorRate,
              currency: "INR",
              paymentTermsDays: 30,
            },
            attributes: {
              create: [
                {
                  key: "multi_city_seed_id",
                  valueJson: seedKey,
                  provenance: "USER_PROVIDED",
                  source: "multi_city_seed",
                },
                {
                  key: "lighting_type",
                  valueJson: "Front-lit",
                  provenance: "USER_PROVIDED",
                  source: "multi_city_seed",
                },
              ],
            },
            screens: {
              create: {
                label: `${city.siteCodePrefix} Screen`,
                inventoryStatus: "AVAILABLE",
                specification: {
                  create: {
                    widthMm: feetToMm(row.widthFt),
                    heightMm: feetToMm(row.heightFt),
                    aspectRatio: `${row.widthFt}:${row.heightFt}`,
                    orientation: "LANDSCAPE",
                  },
                },
              },
            },
          },
        });
        created += 1;
      } else {
        await prisma.location.update({
          where: { id: locationId },
          data: {
            skyarcSiteCode,
            city: city.name,
            district: city.district,
            state: city.state,
            skyarcCommercialJson: {
              clientRateAmount: row.clientRate,
              ratePeriod: "MONTHLY",
              currency: "INR",
              premium: row.premium === true,
            },
          },
        });
      }

      const screen = await prisma.screen.findFirst({ where: { locationId } });
      if (!screen) continue;

      let inventory = await prisma.inventory.findFirst({ where: { screenId: screen.id } });
      if (!inventory) {
        inventory = await prisma.inventory.create({
          data: {
            screenId: screen.id,
            productCode: `MC-${city.siteCodePrefix}-${i + 1}`,
            inventoryType: row.invType,
            status: "AVAILABLE",
            slotCapacity: row.invType.includes("DIGITAL") ? (i % 2 === 0 ? 8 : 4) : row.invType === "KIOSK" ? (i % 3 === 0 ? 2 : 1) : 1,
            staticSpecsJson: {
              widthFt: row.widthFt,
              heightFt: row.heightFt,
              sqft,
              lighting: "Front-lit",
              sides: row.invType === "KIOSK" && i % 3 === 0 ? 2 : 1,
              supportsDualSidedPackage: row.invType === "KIOSK" && i % 3 === 0,
              pooling: row.invType === "KIOSK" && i % 5 === 0 ? "POOLED" : "IDENTIFIED",
            },
          },
        });
      } else {
        await prisma.inventory.update({
          where: { id: inventory.id },
          data: {
            inventoryType: row.invType,
            status: "AVAILABLE",
            staticSpecsJson: {
              widthFt: row.widthFt,
              heightFt: row.heightFt,
              sqft,
              lighting: "Front-lit",
            },
          },
        });
      }

      const overall = estimateScore(sqft);
      await prisma.locationScore.deleteMany({ where: { locationId } });
      await prisma.locationScore.create({
        data: {
          locationId,
          scoringConfigId,
          overallScore: overall,
          overallConfidence: 0.72,
          componentsJson: scoreComponents(overall),
          computedAt: new Date(),
        },
      });

      const existingRate = await prisma.rateCard.findFirst({
        where: { inventoryId: inventory.id },
      });
      if (!existingRate) {
        await prisma.rateCard.create({
          data: {
            inventoryId: inventory.id,
            currency: "INR",
            period: "monthly",
            amount: vendorRate,
            effectiveFrom: new Date(),
            provenance: "ESTIMATED",
          },
        });
      }
    }
  }

  return created;
}
