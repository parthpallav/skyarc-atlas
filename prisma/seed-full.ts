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
import { optimizeMediaPlan } from "../services/api/src/lib/media-planning/optimizer.ts";
import { buildSkyarcSiteCode, getMarketCity } from "@skyarc/shared";

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
  format?: "digital" | "kiosk" | "shelter" | "static" | "unipole";
  clientRate?: number;
}

const LIGHT_LABELS: Record<HoardingRow["light"], string> = {
  BL: "Back-lit",
  FL: "Front-lit",
  NL: "Non-lit",
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
  const coreRows = JSON.parse(readFileSync(dataPath, "utf-8")) as HoardingRow[];
  const rangeFillers: HoardingRow[] = [
    { iid: "SKY-K-01", latitude: 22.2782, longitude: 70.8021, area: "Gondal Road", location: "Gondal Road, Nr. Raiya Telephone Exchange, City Facing", widthFt: 6, heightFt: 4, sqft: 24, light: "FL", format: "kiosk", clientRate: 28_000 },
    { iid: "SKY-K-02", latitude: 22.2841, longitude: 70.7764, area: "Race Course", location: "Race Course Road, Nr. Indoor Stadium Gate 2, Pedestrian Facing", widthFt: 6, heightFt: 4, sqft: 24, light: "BL", format: "kiosk", clientRate: 35_000 },
    { iid: "SKY-K-03", latitude: 22.3018, longitude: 70.7822, area: "University Road", location: "University Road, Opp. Saurashtra University Gate, Campus Facing", widthFt: 8, heightFt: 4, sqft: 32, light: "FL", format: "kiosk", clientRate: 42_000 },
    { iid: "SKY-K-04", latitude: 22.2694, longitude: 70.7918, area: "Mavdi", location: "Mavdi Main Road, Nr. Bus Stand, Market Facing", widthFt: 6, heightFt: 4, sqft: 24, light: "NL", format: "kiosk", clientRate: 32_000 },
    { iid: "SKY-K-05", latitude: 22.3126, longitude: 70.7984, area: "80 Feet Road", location: "80 Feet Road, Nr. Trikon Baug approach, Shopfront Facing", widthFt: 6, heightFt: 4, sqft: 24, light: "FL", format: "kiosk", clientRate: 48_000 },
    { iid: "SKY-K-06", latitude: 22.2578, longitude: 70.7689, area: "Nana Mauva Road", location: "Nana Mauva Road, Nr. Community Hall, Residential Facing", widthFt: 8, heightFt: 4, sqft: 32, light: "BL", format: "kiosk", clientRate: 55_000 },
    { iid: "SKY-B-01", latitude: 22.2896, longitude: 70.8092, area: "Gondal Road", location: "Gondal Road BQS, Nr. ST Workshop, City Bound", widthFt: 20, heightFt: 5, sqft: 100, light: "BL", format: "shelter", clientRate: 38_000 },
    { iid: "SKY-B-02", latitude: 22.2964, longitude: 70.7612, area: "Kalawad Road", location: "Kalawad Road BQS, Nr. Sandipani School, West Bound", widthFt: 20, heightFt: 5, sqft: 100, light: "FL", format: "shelter", clientRate: 52_000 },
    { iid: "SKY-B-03", latitude: 22.2749, longitude: 70.7844, area: "Yagnik Road", location: "Yagnik Road BQS, Nr. Dr. Yagnik Statue, Malaviya Facing", widthFt: 18, heightFt: 5, sqft: 90, light: "NL", format: "shelter", clientRate: 45_000 },
    { iid: "SKY-S-01", latitude: 22.2661, longitude: 70.8127, area: "Bedi", location: "Bedi Road, Nr. Port approach, Highway Facing, Right", widthFt: 20, heightFt: 10, sqft: 200, light: "FL", format: "static", clientRate: 42_000 },
    { iid: "SKY-S-02", latitude: 22.2488, longitude: 70.7741, area: "Shapar", location: "Shapar Veraval Road, Nr. GIDC feeder, Industrial Facing", widthFt: 20, heightFt: 10, sqft: 200, light: "NL", format: "static", clientRate: 48_000 },
    { iid: "SKY-S-03", latitude: 22.3182, longitude: 70.7748, area: "80 Feet Road", location: "80 Feet Road, Nr. KKV Hall, Residential Facing", widthFt: 30, heightFt: 10, sqft: 300, light: "FL", format: "static", clientRate: 62_000 },
    { iid: "SKY-S-04", latitude: 22.3051, longitude: 70.7589, area: "Astron Chowk", location: "Astron Chowk feeder, Towards Amin Marg, LHS", widthFt: 20, heightFt: 20, sqft: 400, light: "BL", format: "static", clientRate: 68_000 },
    { iid: "SKY-D-01", latitude: 22.2924, longitude: 70.7648, area: "Kalawad Road", location: "Kalawad Road LED, Nr. Big Bazaar signal, Race Course Facing", widthFt: 20, heightFt: 10, sqft: 200, light: "BL", format: "digital", clientRate: 95_000 },
    { iid: "SKY-D-02", latitude: 22.2621, longitude: 70.7861, area: "150 Feet Ring Road", location: "150 Feet Ring Road LED, Mavdi Circle, Mall Facing", widthFt: 30, heightFt: 10, sqft: 300, light: "BL", format: "digital", clientRate: 125_000 },
    { iid: "SKY-D-03", latitude: 22.2879, longitude: 70.7941, area: "Yagnik Road", location: "Yagnik Road LED, Malaviya Chowk, Statue Facing", widthFt: 20, heightFt: 10, sqft: 200, light: "FL", format: "digital", clientRate: 150_000 },
    { iid: "SKY-D-04", latitude: 22.3291, longitude: 70.7672, area: "University Road", location: "University Road LED, Nr. Crystal Mall, Ring Road Facing", widthFt: 40, heightFt: 12, sqft: 480, light: "BL", format: "digital", clientRate: 185_000 },
    { iid: "SKY-D-05", latitude: 22.2731, longitude: 70.7561, area: "Kalawad Road", location: "AG Chowk LED, Flyover approach, Nana Mauva Facing", widthFt: 40, heightFt: 10, sqft: 400, light: "BL", format: "digital", clientRate: 220_000 },
    { iid: "SKY-U-01", latitude: 22.3211, longitude: 70.8412, area: "Ahmedabad Highway", location: "Ahmedabad Highway unipole, Nr. Greenland Circle, City Bound", widthFt: 40, heightFt: 20, sqft: 800, light: "FL", format: "unipole", clientRate: 110_000 },
    { iid: "SKY-U-02", latitude: 22.2398, longitude: 70.7612, area: "New 250ft Ring Road", location: "250ft Ring Road unipole, Patidar Chowk, Shapar Facing", widthFt: 50, heightFt: 20, sqft: 1000, light: "NL", format: "unipole", clientRate: 88_000 },
  ];
  const rawRows = [...coreRows, ...rangeFillers];
  console.log(`Loaded ${coreRows.length} mapped sites + ${rangeFillers.length} range-priced fillers`);

  let seededSites = 0;
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]!;
    const assignedOrg = i % 2 === 0 ? brandalystOrg.id : apexOrg.id;
    const invType =
      row.format === "digital"
        ? "DIGITAL_BILLBOARD"
        : row.format === "kiosk"
        ? "KIOSK"
        : row.format === "shelter"
        ? "BUS_SHELTER"
        : row.format === "unipole"
        ? "UNIPOLE"
        : row.format === "static"
        ? "STATIC_BILLBOARD"
        : i % 5 === 0
        ? "DIGITAL_BILLBOARD"
        : i % 5 === 1
        ? "KIOSK"
        : i % 5 === 3
        ? "BUS_SHELTER"
        : row.sqft >= 800
        ? "UNIPOLE"
        : "STATIC_BILLBOARD";

    // Determine realistic corridor-calibrated pricing, then force a usable test range
    // so a ₹5L plan can mix premium faces with cheaper fillers.
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
    } else if (areaLower.includes("bedi") || areaLower.includes("shapar")) {
      corridorBaseRate = 48_000;
    }

    const sizeMultiplier = Math.max(0.7, row.sqft / 400);
    const isDigital = invType === "DIGITAL_BILLBOARD";
    const isKiosk = invType === "KIOSK";
    const isShelter = invType === "BUS_SHELTER";
    let vendorRate = Math.round(corridorBaseRate * sizeMultiplier * (isDigital ? 1.45 : 1.0));
    let clientFacingRate = Math.round(vendorRate * 1.3);

    if (row.clientRate && row.clientRate > 0) {
      clientFacingRate = row.clientRate;
      vendorRate = Math.round(clientFacingRate / 1.3);
    } else if (isKiosk || isShelter) {
      clientFacingRate = 28_000 + (i % 5) * 8_000;
      vendorRate = Math.round(clientFacingRate / 1.3);
    } else if (isDigital) {
      clientFacingRate = 95_000 + (i % 4) * 35_000;
      vendorRate = Math.round(clientFacingRate / 1.3);
    } else if (i % 2 === 1) {
      clientFacingRate = 42_000 + (i % 4) * 7_000;
      vendorRate = Math.round(clientFacingRate / 1.3);
    }

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
      const market = getMarketCity("Rajkot");
      const skyarcSiteCode = buildSkyarcSiteCode(market.name, i + 1);

      await prisma.location.create({
        data: {
          id: locationId,
          skyarcSiteCode,
          vendorMediaCode: row.iid,
          name: locationName,
          latitude: row.latitude,
          longitude: row.longitude,
          road: row.area,
          junction,
          address: row.location,
          city: market.name,
          district: market.district,
          state: market.state,
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
                key: "vendor_media_code",
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
      const market = getMarketCity("Rajkot");
      await prisma.location.update({
        where: { id: locationId },
        data: {
          organizationId: assignedOrg,
          city: market.name,
          district: market.district,
          state: market.state,
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
      await prisma.locationAttribute.upsert({
        where: { locationId_key: { locationId, key: "lighting_type" } },
        create: {
          locationId,
          key: "lighting_type",
          valueJson: LIGHT_LABELS[row.light],
          provenance: "USER_PROVIDED",
          source: "rajkot_inventory_dataset",
        },
        update: { valueJson: LIGHT_LABELS[row.light] },
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
      } else {
        await prisma.rateCard.update({
          where: { id: existingRate.id },
          data: { amount: vendorRate },
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
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
    },
    create: {
      id: "00000000-0000-4000-8000-000000000030",
      name: "Summer Beverage Launch 2026",
      advertiserId: advertiser.id,
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
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
    maxLocations: 8,
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
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-08-14T00:00:00.000Z"),
    },
    create: {
      id: "00000000-0000-4000-8000-000000000031",
      name: "Luxury Towers Phase 1 Launch",
      advertiserId: realtor.id,
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-08-14T00:00:00.000Z"),
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
            maxLocations: 8,
          },
        },
      },
    },
  });

  await prisma.campaignBrief.upsert({
    where: { campaignId: "00000000-0000-4000-8000-000000000031" },
    update: {
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
        maxLocations: 8,
      },
    },
    create: {
      campaignId: "00000000-0000-4000-8000-000000000031",
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
        maxLocations: 8,
      },
    },
  });

  // 4. Pre-Generate Optimized Media Plans for Demo Campaigns
  const availableInventories = await prisma.inventory.findMany({
    where: { status: "AVAILABLE" },
    include: {
      rateCards: { orderBy: { effectiveFrom: "desc" }, take: 1 },
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

  function seedCustomerRate(inv: (typeof availableInventories)[number]): number {
    const commercial = inv.screen.location.skyarcCommercialJson as { clientRateAmount?: number } | null;
    if (commercial?.clientRateAmount && commercial.clientRateAmount > 0) {
      return commercial.clientRateAmount;
    }
    return Number(inv.rateCards[0]?.amount ?? 0);
  }

  const packedCandidates = availableInventories
    .filter((inv) => inv.screen.location.scores[0] && seedCustomerRate(inv) > 0)
    .map((inv) => ({
      inventoryId: inv.id,
      locationId: inv.screen.locationId,
      score: inv.screen.location.scores[0]!.overallScore,
      rateAmount: seedCustomerRate(inv),
      road: inv.screen.location.road,
      inventoryType: inv.inventoryType,
    }));

  async function seedPackedPlan(input: {
    id: string;
    campaignId: string;
    name: string;
    totalBudget: number;
    maxLocations: number;
    explanation: (rank: number, score: number) => string;
  }) {
    const packed = optimizeMediaPlan(packedCandidates, {
      totalBudget: input.totalBudget,
      maxLocations: input.maxLocations,
      minLocations: Math.min(3, input.maxLocations),
    });
    const plan = await prisma.mediaPlan.upsert({
      where: { id: input.id },
      update: {
        name: input.name,
        status: "PROPOSED",
        totalBudget: input.totalBudget,
      },
      create: {
        id: input.id,
        campaignId: input.campaignId,
        name: input.name,
        status: "PROPOSED",
        totalBudget: input.totalBudget,
      },
    });
    await prisma.mediaPlanItem.deleteMany({ where: { mediaPlanId: plan.id } });
    const leftoverPool = packedCandidates
      .filter((row) => !packed.items.some((item) => item.inventoryId === row.inventoryId))
      .sort((a, b) => b.score - a.score);
    for (const item of packed.items) {
      const score =
        packedCandidates.find((row) => row.inventoryId === item.inventoryId)?.score ?? 0;
      const alternativesJson = leftoverPool.slice(0, 5).map((row) => {
        const inv = availableInventories.find((candidate) => candidate.id === row.inventoryId);
        const specs =
          inv?.staticSpecsJson && typeof inv.staticSpecsJson === "object"
            ? (inv.staticSpecsJson as Record<string, unknown>)
            : {};
        return {
          inventoryId: row.inventoryId,
          locationId: row.locationId,
          locationName: inv?.screen.location.name ?? "Site",
          road: row.road,
          score: row.score,
          goalFit: row.score,
          fitReason: "Available for this flight",
          rateAmount: row.rateAmount,
          inventoryType: row.inventoryType,
          lighting: typeof specs.lighting === "string" ? specs.lighting : null,
        };
      });
      await prisma.mediaPlanItem.create({
        data: {
          mediaPlanId: plan.id,
          inventoryId: item.inventoryId,
          budgetAllocated: item.budgetAllocated,
          rank: item.rank,
          explanationText: input.explanation(item.rank, score),
          alternativesJson,
        },
      });
    }
    return packed;
  }

  const plan1Packed = await seedPackedPlan({
    id: "00000000-0000-4000-8000-000000000040",
    campaignId: demoCampaign.id,
    name: "High-Impact Corridor Dominance Plan (Rajkot)",
    totalBudget: 500_000,
    maxLocations: 8,
    explanation: (rank, score) =>
      `Rank ${rank} site packed at customer list price · visibility ${Math.round(score)}/100`,
  });

  await seedPackedPlan({
    id: "00000000-0000-4000-8000-000000000041",
    campaignId: demoCampaign.id,
    name: "Mass-Reach Retail & Youth Pack",
    totalBudget: 350_000,
    maxLocations: 6,
    explanation: (rank, score) =>
      `Rank ${rank} retail-mix site at list price · score ${Math.round(score)}/100`,
  });

  await seedPackedPlan({
    id: "00000000-0000-4000-8000-000000000042",
    campaignId: "00000000-0000-4000-8000-000000000031",
    name: "Prime Ring Road & Arterial Unipole Takeover",
    totalBudget: 1_000_000,
    maxLocations: 8,
    explanation: (rank, score) =>
      `Arterial corridor screen at list price · score ${Math.round(score)}/100`,
  });

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
  console.log(
    `  - ₹5L demo plan packed ${plan1Packed.items.length} sites · leftover ₹${plan1Packed.remainingBudget.toLocaleString("en-IN")}`
  );
  console.log(`  - Pre-generated Media Plans: 3 proposals at customer list prices`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
