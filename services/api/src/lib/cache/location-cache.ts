import { TtlCache } from "./ttl-cache.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

function cacheTtlMs(): number {
  const seconds = Number(process.env.LOCATION_CACHE_TTL_SECONDS ?? "300");
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_TTL_MS;
  return seconds * 1000;
}

const cache = new TtlCache<unknown>(cacheTtlMs());

export function locationListCacheKey(
  role: string,
  userId: string,
  page: number,
  limit: number
): string {
  return `locations:list:${role}:${userId}:${page}:${limit}`;
}

export function locationDetailCacheKey(id: string): string {
  return `locations:detail:${id}`;
}

export function getCachedLocationResponse<T>(key: string): T | undefined {
  if (process.env.LOCATION_CACHE_ENABLED === "false") return undefined;
  return cache.get(key) as T | undefined;
}

export function setCachedLocationResponse<T>(key: string, value: T): void {
  if (process.env.LOCATION_CACHE_ENABLED === "false") return;
  cache.set(key, value);
}

/** Call after any location or cover-photo change. */
export function invalidateLocationCaches(locationId?: string): void {
  if (locationId) {
    cache.delete(locationDetailCacheKey(locationId));
  }
  cache.deleteWhere((key) => key.startsWith("locations:list:"));
}
