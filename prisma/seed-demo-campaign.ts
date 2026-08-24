/**
 * Seeds a demo campaign with a detailed FMCG brief for Rajkot DOOH planning.
 */
import { PrismaClient } from "@prisma/client";
import { SAMPLE_CAMPAIGN, SAMPLE_CAMPAIGN_BRIEF } from "../packages/shared/src/campaign-brief.js";

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
  },
});

async function main() {
  const existing = await prisma.campaign.findFirst({
    where: { name: SAMPLE_CAMPAIGN.name },
  });
  if (existing) {
    console.log(`Demo campaign already exists: ${existing.id}`);
    return;
  }

  let advertiser = await prisma.advertiser.findFirst({
    where: { name: SAMPLE_CAMPAIGN.advertiserName },
  });
  if (!advertiser) {
    advertiser = await prisma.advertiser.create({
      data: { name: SAMPLE_CAMPAIGN.advertiserName },
    });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: SAMPLE_CAMPAIGN.name,
      advertiserId: advertiser.id,
      brief: {
        create: {
          sourceText: SAMPLE_CAMPAIGN_BRIEF,
          parseStatus: "PENDING",
        },
      },
    },
    include: { brief: true },
  });

  console.log(`Demo campaign created: ${campaign.id}`);
  console.log(`  Name: ${campaign.name}`);
  console.log(`  Advertiser: ${SAMPLE_CAMPAIGN.advertiserName}`);
  console.log(`  Brief length: ${SAMPLE_CAMPAIGN_BRIEF.length} chars`);
  console.log("  Open the campaign in web → Parse with AI to extract structured requirements.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
