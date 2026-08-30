import {
  PrismaClient,
  OrganizationType,
  UserRole,
  ScoreStatus,
  AssetKind,
  PhotoView,
} from "@prisma/client";
import argon2 from "argon2";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

const prisma = new PrismaClient();

const DEFAULT_SCORING_WEIGHTS = {
  VISIBILITY: 25,
  AUDIENCE_FIT: 20,
  COMMERCIAL_FIT: 15,
  APPROACH_EXPOSURE: 15,
  BRAND_SUITABILITY: 10,
  VISUAL_COMPETITION: 5,
  LOCATION_QUALITY: 5,
  DATA_CONFIDENCE: 5,
} as const;

interface HoardingRow {
  iid: string;
  latitude: number;
  longitude: number;
  area: string;
  location: string;
  widthFt: number;
  heightFt: number;
  sqft: number;
  light: "BL" | "FL" | "NL";
}

const LIGHT_LABELS: Record<HoardingRow["light"], string> = {
  BL: "backlit",
  FL: "frontlit",
  NL: "non_lit",
};

function feetToMm(ft: number): number {
  return Math.round(ft * 304.8);
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

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

function estimateFactorScores(input: {
  sqft: number;
  lightingType?: string | null;
  road?: string | null;
}): Record<string, number> {
  const { sqft, lightingType, road } = input;
  let visibility = 55;
  if (sqft >= 600) visibility += 28;
  else if (sqft >= 400) visibility += 20;
  else if (sqft >= 200) visibility += 12;
  else visibility += 4;

  const light = (lightingType ?? "").toLowerCase();
  if (light.includes("back") || light === "bl") visibility += 10;
  else if (light.includes("front") || light === "fl") visibility += 5;

  let approach = 58;
  const r = (road ?? "").toLowerCase();
  if (r.includes("ring") || r.includes("150")) approach += 24;
  else if (r.includes("kalawad") || r.includes("yagnik") || r.includes("main")) approach += 18;
  else if (r.includes("road") || r.includes("circle")) approach += 10;

  const audience = r.includes("kalawad") || r.includes("yagnik") ? 84 : 72;
  const brand = r.includes("150") || r.includes("kalawad") ? 80 : 70;
  const commercial = sqft >= 400 ? 78 : 66;
  const clutter = 65;
  const quality = light.includes("back") ? 82 : 70;

  return {
    visibility: clampScore(visibility),
    approach_exposure: clampScore(approach),
    audience_fit: audience,
    brand_suitability: brand,
    commercial_fit: commercial,
    visual_competition: clutter,
    location_quality: quality,
    data_confidence: 70,
  };
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

function buildScoreComponentsFromFactors(factorScores: Record<string, number>) {
  return Object.entries(factorScores).map(([attrKey, score]) => ({
    factor: FACTOR_MAP[attrKey] ?? attrKey.toUpperCase(),
    score,
    confidence: 0.7,
    status: ScoreStatus.COMPUTED,
    evidence: ["computed from location intelligence & site dimensions"],
  }));
}

async function main() {
  console.log("Starting full database seed...");

  // 1. Core Users and Organizations
  const adminPasswordHash = await argon2.hash("ChangeMe123!");
  const userPasswordHash = await argon2.hash("ChangeMe123!");

  const skyarcOrg = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { name: "Skyarc Media" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Skyarc Media",
      type: OrganizationType.INTERNAL,
    },
  });

  const brandalystOrg = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000002" },
    update: {
      name: "Brandalyst Media Network",
      commercialJson: {
        skyarcMarginPercent: 18,
        defaultMarginPercent: 12,
        currency: "INR",
        paymentTermsDays: 30,
      },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Brandalyst Media Network",
      type: OrganizationType.VENDOR,
      commercialJson: {
        skyarcMarginPercent: 18,
        defaultMarginPercent: 12,
        currency: "INR",
        paymentTermsDays: 30,
      },
    },
  });

  const apexOrg = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000003" },
    update: {
      name: "Apex Outdoor Advertising",
      commercialJson: {
        skyarcMarginPercent: 20,
        defaultMarginPercent: 15,
        currency: "INR",
        paymentTermsDays: 45,
      },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Apex Outdoor Advertising",
      type: OrganizationType.VENDOR,
      commercialJson: {
        skyarcMarginPercent: 20,
        defaultMarginPercent: 15,
        currency: "INR",
        paymentTermsDays: 45,
      },
    },
  });

  const clientOrg = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000004" },
    update: {
      name: "Balaji Foods & Retail FMCG",
      type: OrganizationType.CLIENT,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000004",
      name: "Balaji Foods & Retail FMCG",
      type: OrganizationType.CLIENT,
    },
  });

  // Users across all functional roles
  const admin = await prisma.user.upsert({
    where: { email: "admin@skyarcads.com" },
    update: { organizationId: skyarcOrg.id, role: UserRole.SUPERADMIN },
    create: {
      email: "admin@skyarcads.com",
      passwordHash: adminPasswordHash,
      name: "Skyarc Superadmin",
      role: UserRole.SUPERADMIN,
      organizationId: skyarcOrg.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "planner@skyarcads.com" },
    update: { organizationId: skyarcOrg.id, role: UserRole.MEDIA_PLANNER },
    create: {
      email: "planner@skyarcads.com",
      passwordHash: userPasswordHash,
      name: "Aarav Mehta (Media Planner)",
      role: UserRole.MEDIA_PLANNER,
      organizationId: skyarcOrg.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "brandalyst@skyarcads.com" },
    update: { organizationId: brandalystOrg.id, role: UserRole.VENDOR },
    create: {
      email: "brandalyst@skyarcads.com",
      passwordHash: userPasswordHash,
      name: "Brandalyst Media (Vendor)",
      role: UserRole.VENDOR,
      organizationId: brandalystOrg.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "apex@skyarcads.com" },
    update: { organizationId: apexOrg.id, role: UserRole.VENDOR },
    create: {
      email: "apex@skyarcads.com",
      passwordHash: userPasswordHash,
      name: "Apex Outdoor (Vendor)",
      role: UserRole.VENDOR,
      organizationId: apexOrg.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "customer@skyarcads.com" },
    update: { organizationId: clientOrg.id, role: UserRole.CLIENT_VIEWER },
    create: {
      email: "customer@skyarcads.com",
      passwordHash: userPasswordHash,
      name: "Pooja Shah (Brand Advertiser)",
      role: UserRole.CLIENT_VIEWER,
      organizationId: clientOrg.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "operator@skyarcads.com" },
    update: { organizationId: skyarcOrg.id, role: UserRole.FIELD_OPERATOR },
    create: {
      email: "operator@skyarcads.com",
      passwordHash: userPasswordHash,
      name: "Rohan Dave (Field Operator)",
      role: UserRole.FIELD_OPERATOR,
      organizationId: skyarcOrg.id,
    },
  });

  // Platform and Scoring Config
  await prisma.platformConfig.upsert({
    where: { id: "default" },
    update: { data: { defaultSkyarcMarginPercent: 15, currency: "INR" } },
    create: { id: "default", data: { defaultSkyarcMarginPercent: 15, currency: "INR" } },
  });

  const scoringConfig = await prisma.scoringConfig.upsert({
    where: { id: "00000000-0000-4000-8000-000000000010" },
    update: { isActive: true, weightsJson: DEFAULT_SCORING_WEIGHTS },
    create: {
      id: "00000000-0000-4000-8000-000000000010",
      name: "Rajkot Urban Standard v1",
      isActive: true,
      weightsJson: DEFAULT_SCORING_WEIGHTS,
    },
  });

  // 2. Load and seed Rajkot Hoardings & Locations
  const dataPath = join(__dirname, "data", "rajkot-hoardings.json");
  const rawRows = JSON.parse(readFileSync(dataPath, "utf-8")) as HoardingRow[];
  console.log(`Loaded ${rawRows.length} locations from dataset`);

  let seededSites = 0;
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]!;
    const assignedOrg = i % 2 === 0 ? brandalystOrg.id : apexOrg.id;
    const isDigital = i % 3 === 0;
    const invType = isDigital
      ? "DIGITAL_BILLBOARD"
      : row.sqft >= 600
      ? "UNIPOLE"
      : "STATIC_BILLBOARD";

    // Determine realistic corridor-calibrated pricing
    const areaLower = row.area.toLowerCase();
    let corridorBaseRate = 85_000;
    if (areaLower.includes("kalawad") || areaLower.includes("150 feet") || areaLower.includes("150ft")) {
      corridorBaseRate = 180_000;
    } else if (areaLower.includes("amin marg") || areaLower.includes("yagnik") || areaLower.includes("race course")) {
      corridorBaseRate = 150_000;
    } else if (areaLower.includes("university") || areaLower.includes("astron")) {
      corridorBaseRate = 120_000;
    } else if (areaLower.includes("gondal") || areaLower.includes("mavdi") || areaLower.includes("nana mauva")) {
      corridorBaseRate = 95_000;
    } else if (areaLower.includes("80 feet") || areaLower.includes("80ft")) {
      corridorBaseRate = 75_000;
    } else if (areaLower.includes("bedi")) {
      corridorBaseRate = 55_000;
    }

    const sizeMultiplier = Math.max(0.7, row.sqft / 400);
    const vendorRate = Math.round(
      corridorBaseRate * sizeMultiplier * (isDigital ? 1.75 : 1.0)
    );
    const clientFacingRate = Math.round(vendorRate * 1.3); // independent Skyarc customer pricing

    // Location name
    const locationName = `${row.iid} — ${row.area}`;
    const junction = row.location.split(",")[0]?.trim() ?? row.area;

    const existingAttr = await prisma.locationAttribute.findFirst({
      where: { key: "inventory_iid", valueJson: { equals: row.iid } },
      include: { location: true },
    });

    let locationId = existingAttr?.locationId;

    if (!locationId) {
      locationId = randomUUID();
      await prisma.location.create({
        data: {
          id: locationId,
          name: locationName,
          latitude: row.latitude,
          longitude: row.longitude,
          road: row.area,
          junction,
          address: row.location,
          mountingNotes: `${row.widthFt}ft x ${row.heightFt}ft · ${LIGHT_LABELS[row.light]}`,
          surveyStatus: "SUBMITTED",
          capturedAt: new Date(),
          organizationId: assignedOrg,
          createdByUserId: admin.id,
          skyarcCommercialJson: {
            clientRateAmount: clientFacingRate,
            ratePeriod: "MONTHLY",
            currency: "INR",
            notes: `Skyarc prime customer rate card for ${row.area}`,
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
                key: "inventory_iid",
                valueJson: row.iid,
                provenance: "USER_PROVIDED",
                source: "rajkot_inventory_dataset",
              },
              {
                key: "lighting_type",
                valueJson: LIGHT_LABELS[row.light],
                provenance: "USER_PROVIDED",
                source: "rajkot_inventory_dataset",
              },
              {
                key: "sqft",
                valueJson: row.sqft,
                provenance: "USER_PROVIDED",
                source: "rajkot_inventory_dataset",
              },
            ],
          },
          screens: {
            create: {
              label: `${row.iid} Screen`,
              inventoryStatus: "AVAILABLE",
              specification: {
                create: {
                  widthMm: feetToMm(row.widthFt),
                  heightMm: feetToMm(row.heightFt),
                  aspectRatio: `${row.widthFt}:${row.heightFt}`,
                  orientation: row.widthFt >= row.heightFt ? "LANDSCAPE" : "PORTRAIT",
                },
              },
            },
          },
          survey: {
            create: {
              checklist: {
                road_visibility: "EXCELLENT",
                illumination_tested: row.light !== "NL",
                traffic_speed_kmh: 40,
                clutter_level: "LOW",
              },
              freeTextObservation: row.location,
              syncState: "UPLOADED",
            },
          },
        },
      });
    } else {
      // Update existing location commercial JSON & details
      await prisma.location.update({
        where: { id: locationId },
        data: {
          organizationId: assignedOrg,
          skyarcCommercialJson: {
            clientRateAmount: clientFacingRate,
            ratePeriod: "MONTHLY",
            currency: "INR",
            notes: `Skyarc prime customer rate card for ${row.area}`,
          },
          commercialJson: {
            marginPercent: 12,
            defaultRateAmount: vendorRate,
            currency: "INR",
            paymentTermsDays: 30,
          },
        },
      });
    }

    // Screen and Inventory
    const screen = await prisma.screen.findFirst({
      where: { locationId },
      include: { inventories: true },
    });

    if (screen) {
      let inventory = screen.inventories[0];
      if (!inventory) {
        inventory = await prisma.inventory.create({
          data: {
            screenId: screen.id,
            productCode: row.iid,
            inventoryType: invType,
            status: "AVAILABLE",
            notes: `${row.widthFt}x${row.heightFt} ${LIGHT_LABELS[row.light]} on ${row.area}`,
            staticSpecsJson: {
              widthFt: row.widthFt,
              heightFt: row.heightFt,
              sqft: row.sqft,
              lighting: LIGHT_LABELS[row.light],
            },
          },
        });
      } else {
        await prisma.inventory.update({
          where: { id: inventory.id },
          data: {
            inventoryType: invType,
            status: "AVAILABLE",
            staticSpecsJson: {
              widthFt: row.widthFt,
              heightFt: row.heightFt,
              sqft: row.sqft,
              lighting: LIGHT_LABELS[row.light],
            },
          },
        });
      }

      // Rate card
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

    // Scores and Factors
    const factorScores = estimateFactorScores({
      sqft: row.sqft,
      lightingType: LIGHT_LABELS[row.light],
      road: row.area,
    });
    const overallScore = estimateScore(row.sqft, LIGHT_LABELS[row.light]);

    const existingScore = await prisma.locationScore.findFirst({
      where: { locationId },
    });
    if (!existingScore) {
      await prisma.locationScore.create({
        data: {
          locationId,
          scoringConfigId: scoringConfig.id,
          overallScore,
          overallConfidence: 0.75,
          status: ScoreStatus.COMPUTED,
          componentsJson: buildScoreComponentsFromFactors(factorScores),
          computedAt: new Date(),
        },
      });
    }

    // Upsert attribute factors
    for (const [key, val] of Object.entries(factorScores)) {
      await prisma.locationAttribute.upsert({
        where: { locationId_key: { locationId, key } },
        create: {
          locationId,
          key,
          valueJson: val,
          provenance: "ESTIMATED",
          source: "full_seed",
          confidence: 0.75,
        },
        update: {
          valueJson: val,
        },
      });
    }

    seededSites++;
  }

  // 3. Demo FMCG Advertiser & Campaign with Pre-Generated Media Plan
  const advertiser = await prisma.advertiser.upsert({
    where: { id: "00000000-0000-4000-8000-000000000020" },
    update: { name: "Brandalyst Foods & Beverages" },
    create: {
      id: "00000000-0000-4000-8000-000000000020",
      name: "Brandalyst Foods & Beverages",
    },
  });

  const demoCampaign = await prisma.campaign.upsert({
    where: { id: "00000000-0000-4000-8000-000000000030" },
    update: {
      name: "Summer Beverage Launch 2026",
      advertiserId: advertiser.id,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000030",
      name: "Summer Beverage Launch 2026",
      advertiserId: advertiser.id,
    },
  });

  const structuredBrief = {
    objective: "Brand Awareness & Recall",
    brandCategory: "FMCG, Food & Beverages",
    targetAudience: [
      "Youth & College Students (18–24)",
      "Working Professionals & Corporate (25–45)",
      "Daily Commuters & Motorists",
    ],
    geographicFocus: [
      "Kalawad Road",
      "150 Feet Ring Road",
      "Yagnik Road",
      "University Road",
      "Crystal Mall Area",
    ],
    preferredFormats: ["Digital Billboard (DOOH)", "Static Billboard / Hoarding", "Unipole"],
    budget: 500000,
    durationDays: 30,
    kpis: ["Maximum Reach & Impressions", "Corridor Dominance & Impact"],
    constraints: ["High Visibility Score (> 75) Only", "Night Illumination Required"],
    additionalNotes: "Prioritize top junction hoardings with unobstructed vehicular approach.",
  };

  await prisma.campaignBrief.upsert({
    where: { campaignId: demoCampaign.id },
    update: {
      sourceText: `# Campaign Brief: Summer Beverage Launch 2026
**Advertiser**: Brandalyst Foods & Beverages
**Objective**: Drive high brand awareness & retail recall across prime Rajkot corridors.
**Budget**: ₹5,00,000 for 30 Days flight.
**Target Corridors**: Kalawad Road, 150 Feet Ring Road, Yagnik Road, University Road.
**Preferred Media Formats**: Digital Billboard (DOOH), Unipoles, Backlit Static.`,
      structuredRequirementsJson: structuredBrief,
      parseStatus: "PARSED",
    },
    create: {
      campaignId: demoCampaign.id,
      sourceText: `# Campaign Brief: Summer Beverage Launch 2026
**Advertiser**: Brandalyst Foods & Beverages
**Objective**: Drive high brand awareness & retail recall across prime Rajkot corridors.
**Budget**: ₹5,00,000 for 30 Days flight.
**Target Corridors**: Kalawad Road, 150 Feet Ring Road, Yagnik Road, University Road.
**Preferred Media Formats**: Digital Billboard (DOOH), Unipoles, Backlit Static.`,
      structuredRequirementsJson: structuredBrief,
      parseStatus: "PARSED",
    },
  });

  // Second demo campaign: Real Estate Brand
  const realtor = await prisma.advertiser.upsert({
    where: { id: "00000000-0000-4000-8000-000000000021" },
    update: { name: "Shivalik Luxury Living" },
    create: {
      id: "00000000-0000-4000-8000-000000000021",
      name: "Shivalik Luxury Living",
    },
  });

  await prisma.campaign.upsert({
    where: { id: "00000000-0000-4000-8000-000000000031" },
    update: {
      name: "Luxury Towers Phase 1 Launch",
      advertiserId: realtor.id,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000031",
      name: "Luxury Towers Phase 1 Launch",
      advertiserId: realtor.id,
      brief: {
        create: {
          sourceText: "High-net-worth real estate campaign targeting Ring Road and Kalawad corridors.",
          parseStatus: "PARSED",
          structuredRequirementsJson: {
            objective: "New Product / Store Launch",
            brandCategory: "Real Estate & Infrastructure",
            targetAudience: ["High Net-Worth Individuals (HNIs)", "Families & Residential Buyers"],
            geographicFocus: ["150 Feet Ring Road", "Kalawad Road", "Ring Road 2"],
            preferredFormats: ["Unipole", "Digital Billboard (DOOH)"],
            budget: 1000000,
            durationDays: 45,
            kpis: ["Corridor Dominance & Impact"],
            constraints: ["Prime Facing / Unobstructed View Only"],
          },
        },
      },
    },
  });

  // 4. Pre-Generate Optimized Media Plans for Demo Campaigns
  const availableInventories = await prisma.inventory.findMany({
    where: { status: "AVAILABLE" },
    include: {
      screen: {
        include: {
          location: {
            include: {
              scores: { orderBy: { computedAt: "desc" }, take: 1 },
            },
          },
        },
      },
    },
  });

  const candidates = availableInventories
    .filter((inv) => inv.screen.location.scores[0])
    .map((inv) => ({
      inventoryId: inv.id,
      locationId: inv.screen.locationId,
      score: inv.screen.location.scores[0]!.overallScore,
      rateAmount: 0,
    }))
    .sort((a, b) => b.score - a.score);

  // Plan 1: FMCG Prime Corridor Dominance Plan (₹5,00,000 Budget, 6 Sites)
  const plan1Sites = candidates.slice(0, 6);
  const plan1Budget = 500000;
  const scoreSum1 = plan1Sites.reduce((sum, s) => sum + s.score, 0);

  const plan1 = await prisma.mediaPlan.upsert({
    where: { id: "00000000-0000-4000-8000-000000000040" },
    update: {
      name: "High-Impact Corridor Dominance Plan (Rajkot)",
      status: "PROPOSED",
      totalBudget: plan1Budget,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000040",
      campaignId: demoCampaign.id,
      name: "High-Impact Corridor Dominance Plan (Rajkot)",
      status: "PROPOSED",
      totalBudget: plan1Budget,
    },
  });

  await prisma.mediaPlanItem.deleteMany({ where: { mediaPlanId: plan1.id } });
  for (let idx = 0; idx < plan1Sites.length; idx++) {
    const s = plan1Sites[idx]!;
    const proportion = scoreSum1 > 0 ? s.score / scoreSum1 : 1 / plan1Sites.length;
    const allocated = Math.floor(plan1Budget * proportion);
    await prisma.mediaPlanItem.create({
      data: {
        mediaPlanId: plan1.id,
        inventoryId: s.inventoryId,
        budgetAllocated: allocated,
        rank: idx + 1,
        explanationText: `Rank ${idx + 1} site with composite visibility score ${Math.round(s.score)}/100`,
      },
    });
  }

  // Plan 2: Mass Reach Retail Mix Plan (₹3,50,000 Budget, 4 Sites)
  const plan2Sites = candidates.slice(2, 6);
  const plan2Budget = 350000;
  const scoreSum2 = plan2Sites.reduce((sum, s) => sum + s.score, 0);

  const plan2 = await prisma.mediaPlan.upsert({
    where: { id: "00000000-0000-4000-8000-000000000041" },
    update: {
      name: "Mass-Reach Retail & Youth Pack",
      status: "PROPOSED",
      totalBudget: plan2Budget,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000041",
      campaignId: demoCampaign.id,
      name: "Mass-Reach Retail & Youth Pack",
      status: "PROPOSED",
      totalBudget: plan2Budget,
    },
  });

  await prisma.mediaPlanItem.deleteMany({ where: { mediaPlanId: plan2.id } });
  for (let idx = 0; idx < plan2Sites.length; idx++) {
    const s = plan2Sites[idx]!;
    const proportion = scoreSum2 > 0 ? s.score / scoreSum2 : 1 / plan2Sites.length;
    const allocated = Math.floor(plan2Budget * proportion);
    await prisma.mediaPlanItem.create({
      data: {
        mediaPlanId: plan2.id,
        inventoryId: s.inventoryId,
        budgetAllocated: allocated,
        rank: idx + 1,
        explanationText: `Rank ${idx + 1} retail cluster screen with score ${Math.round(s.score)}/100`,
      },
    });
  }

  // Plan 3: Luxury Towers Unipole Plan (₹10,00,000 Budget, 8 Sites)
  const plan3Sites = candidates.slice(0, 8);
  const plan3Budget = 1000000;
  const scoreSum3 = plan3Sites.reduce((sum, s) => sum + s.score, 0);

  const plan3 = await prisma.mediaPlan.upsert({
    where: { id: "00000000-0000-4000-8000-000000000042" },
    update: {
      name: "Prime Ring Road & Arterial Unipole Takeover",
      status: "PROPOSED",
      totalBudget: plan3Budget,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000042",
      campaignId: "00000000-0000-4000-8000-000000000031",
      name: "Prime Ring Road & Arterial Unipole Takeover",
      status: "PROPOSED",
      totalBudget: plan3Budget,
    },
  });

  await prisma.mediaPlanItem.deleteMany({ where: { mediaPlanId: plan3.id } });
  for (let idx = 0; idx < plan3Sites.length; idx++) {
    const s = plan3Sites[idx]!;
    const proportion = scoreSum3 > 0 ? s.score / scoreSum3 : 1 / plan3Sites.length;
    const allocated = Math.floor(plan3Budget * proportion);
    await prisma.mediaPlanItem.create({
      data: {
        mediaPlanId: plan3.id,
        inventoryId: s.inventoryId,
        budgetAllocated: allocated,
        rank: idx + 1,
        explanationText: `Arterial arterial corridor screen with score ${Math.round(s.score)}/100`,
      },
    });
  }

  console.log("\nFull database seed completed successfully:");
  console.log(`  - Organizations: Skyarc Media (Internal), Brandalyst Media Network (Vendor), Apex Outdoor (Vendor), Balaji Foods (Client)`);
  console.log(`  - Seeded Production Users across all roles:`);
  console.log(`      • Superadmin:      admin@skyarcads.com`);
  console.log(`      • Media Planner:   planner@skyarcads.com`);
  console.log(`      • Vendor (Owner):  brandalyst@skyarcads.com, apex@skyarcads.com`);
  console.log(`      • Brand Customer:  customer@skyarcads.com`);
  console.log(`      • Field Operator:  operator@skyarcads.com`);
  console.log(`  - Total Billboard Locations seeded: ${seededSites}`);
  console.log(`  - Campaigns seeded: 2 live campaigns with guided briefs`);
  console.log(`  - Pre-generated Media Plans: 3 fully optimized proposals with allocated sites & PDF export`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
