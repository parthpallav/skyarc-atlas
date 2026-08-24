import type { Env } from "@skyarc/config";
import { photoViewSortKey } from "@skyarc/shared";
import type { StorageProvider } from "./storage/types.js";

/** Public CDN URL when R2 bucket has public access configured. */
export function publicAssetUrl(env: Env, r2Key: string): string | null {
  if (!env.R2_PUBLIC_URL?.trim()) return null;
  const base = env.R2_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/${r2Key}`;
}

export async function resolveAssetUrl(
  env: Env,
  storage: StorageProvider,
  r2Key: string,
  uploadStatus: string
): Promise<string | null> {
  if (uploadStatus !== "UPLOADED") return null;
  const publicUrl = publicAssetUrl(env, r2Key);
  if (publicUrl) return publicUrl;
  try {
    return await storage.createPresignedDownload(r2Key);
  } catch {
    return null;
  }
}

export async function coverUrlsForLocations(
  env: Env,
  locationIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (locationIds.length === 0) return result;

  const { prisma } = await import("./prisma.js");
  const assets = await prisma.locationAsset.findMany({
    where: {
      locationId: { in: locationIds },
      uploadStatus: "UPLOADED",
    },
    select: { locationId: true, r2Key: true, view: true },
  });

  const byLocation = new Map<string, typeof assets>();
  for (const asset of assets) {
    const list = byLocation.get(asset.locationId) ?? [];
    list.push(asset);
    byLocation.set(asset.locationId, list);
  }

  for (const [locationId, list] of byLocation) {
    const sorted = [...list].sort(
      (a, b) => photoViewSortKey(a.view) - photoViewSortKey(b.view)
    );
    const best = sorted[0];
    if (!best) continue;
    const url = publicAssetUrl(env, best.r2Key);
    if (url) result.set(locationId, url);
  }

  return result;
}
