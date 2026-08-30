/**
 * Seeds a demo campaign with a detailed FMCG brief for Rajkot DOOH planning.
 */
import { PrismaClient } from "@prisma/client";

const SAMPLE_CAMPAIGN = {
  name: "Summer Beverage Launch 2026",
  advertiserName: "Brandalyst Foods",
};

const SAMPLE_CAMPAIGN_BRIEF = `# Campaign Brief: Summer Beverage Launch 2026
**Advertiser**: Brandalyst Foods
**Industry**: FMCG / Beverages
**Objective**: Drive high brand awareness, footfall, and retail product recall for the new iced beverage line across prime Rajkot corridors.
**Target Audience**: Youth, college students (18-24), working professionals, families, and high-footfall commuter corridors.
**Target Budget**: ₹5,00,000 (INR 5 Lakh)
**Flight Duration**: 30 Days
**Target Corridors**: Kalawad Road, 150 Feet Ring Road, Yagnik Road, University Road, Crystal Mall Area, Kotecha Chowk.
**Preferred Formats**: Digital Billboards (DOOH), Unipoles, Backlit Hoardings.
**Key Requirements**: High traffic visibility, night illumination, unobstructed approach view.`;

const prisma = new PrismaClient();

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
