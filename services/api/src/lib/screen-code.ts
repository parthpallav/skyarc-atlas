import { buildSkyarcScreenCode, buildSkyarcSiteCode } from "@skyarc/shared";
import { prisma } from "./prisma.js";

/** Allocate next unique public screen code for a location. */
export async function allocateSkyarcScreenCode(locationId: string): Promise<string> {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) throw new Error("Location not found");

  const base =
    location.skyarcSiteCode?.trim().toUpperCase() ||
    buildSkyarcSiteCode(location.city, (await prisma.screen.count()) + 1);

  const existing = await prisma.screen.count({ where: { locationId } });
  let faceIndex = existing + 1;
  for (let attempt = 0; attempt < 64; attempt++) {
    const code = buildSkyarcScreenCode(base, faceIndex);
    const clash = await prisma.screen.findUnique({ where: { skyarcScreenCode: code } });
    if (!clash) return code;
    faceIndex += 1;
  }
  throw new Error(`Unable to allocate skyarcScreenCode for location ${locationId}`);
}
