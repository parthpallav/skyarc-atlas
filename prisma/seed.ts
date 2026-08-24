import { PrismaClient, UserRole } from "@prisma/client";
import argon2 from "argon2";

/** Inline defaults so seed runs without building workspace packages. */
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

/** Use direct connection for scripts — avoids Supabase pooler prepared-statement errors. */
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
  },
});

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@skyarc.in";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const passwordHash = await argon2.hash(adminPassword);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: "SkyArc Admin",
      role: UserRole.ADMIN,
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
