import { TtlCache } from "./ttl-cache.js";

/** How long a "exploring this site" heartbeat stays live. */
const PRESENCE_TTL_MS = 45_000;

const presence = new TtlCache<{ at: number }>(PRESENCE_TTL_MS);

function key(locationId: string, userId: string) {
  return `presence:loc:${locationId}:user:${userId}`;
}

/** Record that a user is actively exploring a site. */
export function touchLocationPresence(locationId: string, userId: string): { expiresIn: number } {
  presence.set(key(locationId, userId), { at: Date.now() });
  return { expiresIn: Math.round(PRESENCE_TTL_MS / 1000) };
}

/** Distinct live explorers for one site (excludes optional self). */
export function countLocationViewers(locationId: string, excludeUserId?: string): number {
  const prefix = `presence:loc:${locationId}:user:`;
  let count = 0;
  for (const k of presence.keys()) {
    if (!k.startsWith(prefix)) continue;
    const uid = k.slice(prefix.length);
    if (excludeUserId && uid === excludeUserId) continue;
    count += 1;
  }
  return count;
}

export function countLocationViewersBatch(
  locationIds: string[],
  excludeUserId?: string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of locationIds) out[id] = 0;
  const want = new Set(locationIds);
  for (const k of presence.keys()) {
    // presence:loc:{locationId}:user:{userId}
    if (!k.startsWith("presence:loc:")) continue;
    const rest = k.slice("presence:loc:".length);
    const sep = rest.indexOf(":user:");
    if (sep < 0) continue;
    const locationId = rest.slice(0, sep);
    const userId = rest.slice(sep + ":user:".length);
    if (!want.has(locationId)) continue;
    if (excludeUserId && userId === excludeUserId) continue;
    out[locationId] = (out[locationId] ?? 0) + 1;
  }
  return out;
}
