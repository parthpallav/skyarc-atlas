import { PrismaClient, OrganizationType, UserRole } from "@prisma/client";
import argon2 from "argon2";

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

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@skyarc.in";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const vendorEmail = process.env.SEED_VENDOR_EMAIL ?? "vendor@skyarc.in";
  const vendorPassword = process.env.SEED_VENDOR_PASSWORD ?? "ChangeMe123!";

  const passwordHash = await argon2.hash(adminPassword);
  const vendorPasswordHash = await argon2.hash(vendorPassword);

  const skyarcOrg = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { name: "Skyarc" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Skyarc",
      type: OrganizationType.INTERNAL,
    },
  });

  const demoVendorOrg = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000002" },
    update: {
      name: "Demo Media Owner",
      commercialJson: {
        skyarcMarginPercent: 18,
        defaultMarginPercent: 12,
        currency: "INR",
        paymentTermsDays: 30,
      },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Demo Media Owner",
      type: OrganizationType.VENDOR,
      commercialJson: {
        skyarcMarginPercent: 18,
        defaultMarginPercent: 12,
        currency: "INR",
        paymentTermsDays: 30,
      },
    },
  });

  await prisma.platformConfig.upsert({
    where: { id: "default" },
    update: {
      data: { defaultSkyarcMarginPercent: 15, currency: "INR" },
    },
    create: {
      id: "default",
      data: { defaultSkyarcMarginPercent: 15, currency: "INR" },
    },
  });

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { organizationId: skyarcOrg.id },
    create: {
      email: adminEmail,
      passwordHash,
      name: "Skyarc Admin",
      role: UserRole.ADMIN,
      organizationId: skyarcOrg.id,
    },
  });

  await prisma.user.upsert({
    where: { email: vendorEmail },
    update: { organizationId: demoVendorOrg.id, role: UserRole.VENDOR },
    create: {
      email: vendorEmail,
      passwordHash: vendorPasswordHash,
      name: "Demo Vendor",
      role: UserRole.VENDOR,
      organizationId: demoVendorOrg.id,
    },
  });

  const existingConfig = await prisma.scoringConfig.findFirst({
    where: { isActive: true },
  });

  if (!existingConfig) {
    await prisma.scoringConfig.create({
      data: {
        name: "Default",
        isActive: true,
        weightsJson: DEFAULT_SCORING_WEIGHTS,
      },
    });
  }

  console.log("Seed complete");
  console.log(`  Admin: ${adminEmail}`);
  console.log(`  Vendor: ${vendorEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
