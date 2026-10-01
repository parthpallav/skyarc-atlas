import type { Env } from "@skyarc/config";
import { photoViewSortKey, isImageContentType } from "@skyarc/shared";
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
  locationIds: string[],
  /** When set, falls back to short-lived download URLs (needed for PDF image embed). */
  storage?: StorageProvider
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (locationIds.length === 0) return result;

  const { prisma } = await import("./prisma.js");
  const assets = await prisma.locationAsset.findMany({
    where: {
      locationId: { in: locationIds },
      uploadStatus: "UPLOADED",
    },
    select: { locationId: true, r2Key: true, view: true, contentType: true, uploadStatus: true },
  });

  const byLocation = new Map<string, typeof assets>();
  for (const asset of assets) {
    const list = byLocation.get(asset.locationId) ?? [];
    list.push(asset);
    byLocation.set(asset.locationId, list);
  }

  for (const [locationId, list] of byLocation) {
    const sorted = [...list].sort((a, b) => {
      const aImage = isImageContentType(a.contentType) ? 0 : 1;
      const bImage = isImageContentType(b.contentType) ? 0 : 1;
      if (aImage !== bImage) return aImage - bImage;
      return photoViewSortKey(a.view) - photoViewSortKey(b.view);
    });
    const best = sorted[0];
    if (!best) continue;
    if (storage) {
      const url = await resolveAssetUrl(env, storage, best.r2Key, best.uploadStatus);
      if (url) result.set(locationId, url);
    } else {
      const url = publicAssetUrl(env, best.r2Key);
      if (url) result.set(locationId, url);
    }
  }

  return result;
}

/** Up to `limit` media items (images + videos) per location for list carousels. */
export async function previewMediaForLocations(
  env: Env,
  locationIds: string[],
  limit = 6
): Promise<
  Map<
    string,
    Array<{ id: string; url: string; contentType: string; kind: string; sortOrder: number }>
  >
> {
  const result = new Map<
    string,
    Array<{ id: string; url: string; contentType: string; kind: string; sortOrder: number }>
  >();
  if (locationIds.length === 0) return result;

  const { prisma } = await import("./prisma.js");
  const assets = await prisma.locationAsset.findMany({
    where: {
      locationId: { in: locationIds },
      uploadStatus: "UPLOADED",
      OR: [
        { contentType: { startsWith: "image/" } },
        { contentType: { startsWith: "video/" } },
      ],
    },
    select: {
      id: true,
      locationId: true,
      r2Key: true,
      view: true,
      contentType: true,
      kind: true,
    },
  });

  const byLocation = new Map<string, typeof assets>();
  for (const asset of assets) {
    const list = byLocation.get(asset.locationId) ?? [];
    list.push(asset);
    byLocation.set(asset.locationId, list);
  }

  for (const [locationId, list] of byLocation) {
    const sorted = [...list]
      .sort((a, b) => {
        const aImage = isImageContentType(a.contentType) ? 0 : 1;
        const bImage = isImageContentType(b.contentType) ? 0 : 1;
        if (aImage !== bImage) return aImage - bImage;
        return photoViewSortKey(a.view) - photoViewSortKey(b.view);
      })
      .slice(0, Math.max(1, limit));

    const items: Array<{
      id: string;
      url: string;
      contentType: string;
      kind: string;
      sortOrder: number;
    }> = [];
    let order = 0;
    for (const asset of sorted) {
      const url = publicAssetUrl(env, asset.r2Key);
      if (!url) continue;
      items.push({
        id: asset.id,
        url,
        contentType: asset.contentType,
        kind: asset.kind,
        sortOrder: order++,
      });
    }
    if (items.length) result.set(locationId, items);
  }

  return result;
}
export async function pitchPhotoUrlsForLocations(
  env: Env,
  locationIds: string[],
  storage?: StorageProvider,
  limit = 3
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (locationIds.length === 0) return result;

  const { prisma } = await import("./prisma.js");
  const assets = await prisma.locationAsset.findMany({
    where: {
      locationId: { in: locationIds },
      uploadStatus: "UPLOADED",
    },
    select: { locationId: true, r2Key: true, view: true, contentType: true, uploadStatus: true },
  });

  const byLocation = new Map<string, typeof assets>();
  for (const asset of assets) {
    const list = byLocation.get(asset.locationId) ?? [];
    list.push(asset);
    byLocation.set(asset.locationId, list);
  }

  for (const [locationId, list] of byLocation) {
    const sorted = [...list]
      .filter((a) => isImageContentType(a.contentType))
      .sort((a, b) => photoViewSortKey(a.view) - photoViewSortKey(b.view))
      .slice(0, Math.max(1, limit));

    const urls: string[] = [];
    for (const asset of sorted) {
      if (storage) {
        const url = await resolveAssetUrl(env, storage, asset.r2Key, asset.uploadStatus);
        if (url) urls.push(url);
      } else {
        const url = publicAssetUrl(env, asset.r2Key);
        if (url) urls.push(url);
      }
    }
    if (urls.length) result.set(locationId, urls);
  }

  return result;
}
