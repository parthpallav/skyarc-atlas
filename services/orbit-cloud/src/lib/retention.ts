/**
 * Retention policies — raw short-lived; aggregates longer-lived.
 * Estimates documented in ORBIT_TELEMETRY_API.md.
 */
import type { PrismaClient } from "../generated/prisma/index.js";
import type { OrbitEnv } from "../env.js";

export async function applyRetentionPolicies(db: PrismaClient, env: OrbitEnv) {
  const rawDays = env.ORBIT_TELEMETRY_RETENTION_DAYS;
  const aggregateDays = env.ORBIT_AGGREGATE_RETENTION_DAYS;
  const now = Date.now();
  const rawCutoff = new Date(now - rawDays * 86_400_000);
  const aggCutoff = new Date(now - aggregateDays * 86_400_000);

  const raw = await db.orbitRawEvent.deleteMany({
    where: { receivedAt: { lt: rawCutoff } },
  });
  // Preserve 1h/1d aggregates longer; purge 5m with raw window
  const agg5m = await db.orbitAggregate.deleteMany({
    where: { bucket: "5m", bucketStart: { lt: rawCutoff } },
  });
  const aggLong = await db.orbitAggregate.deleteMany({
    where: {
      bucket: { in: ["1h", "1d"] },
      bucketStart: { lt: aggCutoff },
    },
  });
  const inbox = await db.orbitIngestInbox.deleteMany({
    where: { processedAt: { not: null, lt: rawCutoff } },
  });

  return {
    deletedRaw: raw.count,
    deletedAgg5m: agg5m.count,
    deletedAggLong: aggLong.count,
    deletedInbox: inbox.count,
    rawRetentionDays: rawDays,
    aggregateRetentionDays: aggregateDays,
  };
}

/** Rough storage estimate helper (unit-testable, no DB). */
export function estimateStorageBytes(input: {
  devices: number;
  eventsPerDevicePerDay: number;
  rawDays: number;
  avgPayloadBytes: number;
}) {
  const rawBytes =
    input.devices * input.eventsPerDevicePerDay * input.rawDays * input.avgPayloadBytes;
  // Aggregates ≈ 3 buckets × 288 (5m/day) compressed summary ~200B each worst case for 5m only kept short
  const aggBytes = input.devices * 288 * 200 * Math.min(input.rawDays, 14);
  return { rawBytes, aggBytes, totalBytes: rawBytes + aggBytes };
}
