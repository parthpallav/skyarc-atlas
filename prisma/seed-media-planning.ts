/**
 * Backfills Inventory, RateCards, and LocationScores required for media plan optimization.
 * Run after db:seed:rajkot (or whenever plans return 0 sites).
 */
import { PrismaClient, ScoreStatus } from "@prisma/client";
import {
  buildScoreComponentsFromFactors,
  estimateFactorScores,
} from "../services/api/src/lib/media-planning/insights.js";

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
  },
});

const RATE_PER_SQFT_INR = 80;

function estimateMonthlyRate(sqft: number): number {
  return Math.max(15_000, Math.round(sqft * RATE_PER_SQFT_INR));
}

function estimateScore(sqft: number, lightingType?: string | null): number {
  let score = 58;
  if (sqft >= 400) score += 18;
  else if (sqft >= 300) score += 12;
  else if (sqft >= 200) score += 6;

  const light = (lightingType ?? "").toLowerCase();
  if (light.includes("back") || light === "bl") score += 10;
  if (light.includes("front") || light === "fl") score += 4;

  return Math.min(92, score);
}

async function main() {
  const scoringConfig = await prisma.scoringConfig.findFirst({ where: { isActive: true } });
  if (!scoringConfig) {
    throw new Error("No active scoring config — run pnpm db:seed first");
  }

  const screens = await prisma.screen.findMany({
    where: { inventoryStatus: "AVAILABLE" },
    include: {
      inventories: true,
      location: {
        include: {
          attributes: true,
          scores: { orderBy: { computedAt: "desc" }, take: 1 },
        },
      },
    },
  });

  let inventoriesCreated = 0;
  let rateCardsCreated = 0;
  let scoresCreated = 0;

  for (const screen of screens) {
    const location = screen.location;
    const attrMap = Object.fromEntries(
      location.attributes.map((a) => [a.key, a.valueJson])
    );
    const sqft = typeof attrMap.sqft === "number" ? attrMap.sqft : 400;
    const lighting =
      typeof attrMap.lighting_type === "string" ? attrMap.lighting_type : null;

    let inventory = screen.inventories[0];
    if (!inventory) {
      inventory = await prisma.inventory.create({
        data: {
          screenId: screen.id,
          productCode: screen.label,
          status: "AVAILABLE",
          notes: `Auto-linked from screen ${screen.label}`,
        },
      });
      inventoriesCreated += 1;
    } else if (inventory.status !== "AVAILABLE") {
      await prisma.inventory.update({
        where: { id: inventory.id },
        data: { status: "AVAILABLE" },
      });
    }

    const existingRate = await prisma.rateCard.findFirst({
      where: { inventoryId: inventory.id },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!existingRate) {
      await prisma.rateCard.create({
        data: {
          inventoryId: inventory.id,
          currency: "INR",
          period: "monthly",
          amount: estimateMonthlyRate(sqft),
          effectiveFrom: new Date(),
          provenance: "ESTIMATED",
        },
      });
      rateCardsCreated += 1;
    }

    if (!location.scores[0]) {
      const overallScore = estimateScore(sqft, lighting);
      const factorScores = estimateFactorScores({
        sqft,
        lightingType: lighting,
        road: location.road,
      });
      await prisma.locationScore.create({
        data: {
          locationId: location.id,
          scoringConfigId: scoringConfig.id,
          overallScore,
          overallConfidence: 0.65,
          status: ScoreStatus.COMPUTED,
          componentsJson: buildScoreComponentsFromFactors(factorScores),
          computedAt: new Date(),
        },
      });
      for (const [key, value] of Object.entries(factorScores)) {
        await prisma.locationAttribute.upsert({
          where: { locationId_key: { locationId: location.id, key } },
          create: {
            locationId: location.id,
            key,
            valueJson: value,
            provenance: "ESTIMATED",
            source: "seed-media-planning",
            confidence: 0.65,
          },
          update: {
            valueJson: value,
            provenance: "ESTIMATED",
            source: "seed-media-planning",
            confidence: 0.65,
          },
        });
      }
      scoresCreated += 1;
    }
  }

  const eligible = await prisma.inventory.count({
    where: {
      status: "AVAILABLE",
      screen: {
        location: {
          scores: { some: {} },
        },
      },
    },
  });

  console.log("Media planning seed complete:");
  console.log(`  Inventories created: ${inventoriesCreated}`);
  console.log(`  Rate cards created: ${rateCardsCreated}`);
  console.log(`  Location scores created: ${scoresCreated}`);
  console.log(`  Eligible inventory for optimizer: ${eligible}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
