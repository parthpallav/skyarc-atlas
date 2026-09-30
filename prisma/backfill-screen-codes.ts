/**
 * Idempotent backfill for Screen.skyarcScreenCode.
 * Usage: pnpm exec tsx prisma/backfill-screen-codes.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function buildSkyarcScreenCode(siteCode: string, faceIndex: number): string {
  const base = siteCode.trim().toUpperCase();
  if (faceIndex <= 1) return base;
  return `${base}-F${faceIndex}`;
}

function buildSkyarcSiteCode(city: string | null | undefined, ordinal: number): string {
  const prefix = (city ?? "XXX").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X") || "XXX";
  return `SKY-${prefix}-${String(ordinal).padStart(3, "0")}`;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const locations = await prisma.location.findMany({
    include: { screens: { orderBy: { createdAt: "asc" } } },
  });
  let updated = 0;
  for (const location of locations) {
    const base =
      location.skyarcSiteCode?.trim().toUpperCase() ||
      buildSkyarcSiteCode(location.city, updated + 1);
    let face = 1;
    for (const screen of location.screens) {
      if (screen.skyarcScreenCode) {
        face += 1;
        continue;
      }
      let code = buildSkyarcScreenCode(base, face);
      while (await prisma.screen.findUnique({ where: { skyarcScreenCode: code } })) {
        face += 1;
        code = buildSkyarcScreenCode(base, face);
      }
      console.log(`${dryRun ? "DRY " : ""}${screen.id} -> ${code}`);
      if (!dryRun) {
        await prisma.screen.update({
          where: { id: screen.id },
          data: { skyarcScreenCode: code },
        });
      }
      updated += 1;
      face += 1;
    }
  }
  console.log(`Done. ${updated} screens ${dryRun ? "would be" : "were"} updated.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
