/**
 * Durable ingest handoff + normalization.
 * Broker/HTTP acceptance ≠ processed persistence; inbox is the crash boundary.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/index.js";
import {
  capabilityStatus,
  connectivityFromHeartbeat,
  OrbitMeasurementType,
  ORBIT_PAYLOAD_VERSION,
} from "@skyarc/shared";
import { orbitTelemetryPayloadV1Schema, MAX_ORBIT_TELEMETRY_BYTES, scrubSecretsFromPayload } from "./payload.js";
import { enqueueOrbitEvent } from "../events.js";
import { OrbitEventType } from "@skyarc/shared";

type Db = PrismaClient;

export type IngestContext = {
  authenticatedTenantId: string;
  deviceId: string;
  deviceType: string;
  topic?: string | null;
  maxSkewMs?: number;
  staleAfterMs?: number;
  receivedAt?: Date;
};

export function validateTelemetryBytes(raw: string | Buffer): { ok: true; text: string } | { ok: false; reason: string } {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  if (Buffer.byteLength(text, "utf8") > MAX_ORBIT_TELEMETRY_BYTES) {
    return { ok: false, reason: `Payload exceeds ${MAX_ORBIT_TELEMETRY_BYTES} bytes` };
  }
  return { ok: true, text };
}

export async function acceptIntoInbox(
  db: Db,
  input: {
    deviceId: string;
    tenantId: string;
    topic?: string | null;
    payload: unknown;
    receivedAt?: Date;
  }
) {
  const scrubbed = scrubSecretsFromPayload(input.payload);
  const eventId =
    scrubbed &&
    typeof scrubbed === "object" &&
    typeof (scrubbed as { eventId?: unknown }).eventId === "string"
      ? (scrubbed as { eventId: string }).eventId
      : null;
  if (!eventId) {
    return { error: "eventId required" as const };
  }

  try {
    const row = await db.orbitIngestInbox.create({
      data: {
        eventId,
        deviceId: input.deviceId,
        tenantId: input.tenantId,
        topic: input.topic ?? null,
        payloadJson: scrubbed as Prisma.InputJsonValue,
        receivedAt: input.receivedAt ?? new Date(),
      },
    });
    return { inbox: row, duplicate: false as const };
  } catch {
    const existing = await db.orbitIngestInbox.findUnique({ where: { eventId } });
    if (existing) return { inbox: existing, duplicate: true as const };
    return { error: "Inbox insert failed" as const };
  }
}

/** Remove auth material before durable persistence — never store device secrets. */
export { scrubSecretsFromPayload } from "./payload.js";

function bucketStart(d: Date, bucket: "5m" | "1h" | "1d"): Date {
  const t = new Date(d);
  t.setUTCSeconds(0, 0);
  if (bucket === "5m") {
    t.setUTCMinutes(Math.floor(t.getUTCMinutes() / 5) * 5);
  } else if (bucket === "1h") {
    t.setUTCMinutes(0);
  } else {
    t.setUTCHours(0, 0, 0, 0);
  }
  return t;
}

export async function processInboxItem(db: Db, inboxId: string, ctx: IngestContext) {
  const inbox = await db.orbitIngestInbox.findUnique({ where: { id: inboxId } });
  if (!inbox) return { error: "Inbox not found" as const };
  if (inbox.processedAt) return { skipped: true as const, reason: "already_processed" as const };

  const receivedAt = ctx.receivedAt ?? inbox.receivedAt;
  const parsed = orbitTelemetryPayloadV1Schema.safeParse(inbox.payloadJson);
  if (!parsed.success) {
    await db.orbitIngestFailure.create({
      data: {
        deviceId: inbox.deviceId,
        tenantId: inbox.tenantId,
        topic: inbox.topic,
        reason: parsed.error.issues.map((i) => i.message).join("; "),
        payloadPreview: JSON.stringify(inbox.payloadJson).slice(0, 200),
        receivedAt,
      },
    });
    await db.orbitIngestInbox.update({
      where: { id: inbox.id },
      data: { processedAt: receivedAt, processError: "schema_invalid" },
    });
    return { rejected: true as const, reason: "schema_invalid" as const };
  }

  const payload = parsed.data;
  if (payload.deviceId !== inbox.deviceId || payload.deviceId !== ctx.deviceId) {
    await db.orbitIngestFailure.create({
      data: {
        deviceId: inbox.deviceId,
        tenantId: inbox.tenantId,
        topic: inbox.topic,
        reason: "Payload deviceId does not match authenticated device / topic",
        receivedAt,
      },
    });
    await db.orbitIngestInbox.update({
      where: { id: inbox.id },
      data: { processedAt: receivedAt, processError: "device_mismatch" },
    });
    return { rejected: true as const, reason: "device_mismatch" as const };
  }

  if (inbox.tenantId !== ctx.authenticatedTenantId) {
    return { rejected: true as const, reason: "tenant_mismatch" as const };
  }

  const cap = capabilityStatus(ctx.deviceType, payload.measurementType);
  const observedAt = new Date(payload.observedAt);

  // Deduped raw — unique on eventId
  try {
    await db.orbitRawEvent.create({
      data: {
        eventId: payload.eventId,
        deviceId: payload.deviceId,
        tenantId: inbox.tenantId,
        bootId: payload.bootId,
        sessionId: payload.sessionId,
        sequence: payload.sequence,
        observedAt,
        receivedAt,
        firmwareVersion: payload.firmwareVersion,
        measurementType: payload.measurementType,
        schemaVersion: payload.schemaVersion ?? ORBIT_PAYLOAD_VERSION,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch {
    await db.orbitIngestInbox.update({
      where: { id: inbox.id },
      data: { processedAt: receivedAt, processError: null },
    });
    return { duplicate: true as const };
  }

  const numericValue = typeof payload.value === "number" ? payload.value : null;
  const textValue =
    typeof payload.value === "string"
      ? payload.value
      : typeof payload.value === "boolean"
        ? String(payload.value)
        : null;

  await db.orbitMeasurement.create({
    data: {
      eventId: payload.eventId,
      deviceId: payload.deviceId,
      tenantId: inbox.tenantId,
      measurementType: payload.measurementType,
      observedAt,
      receivedAt,
      numericValue,
      textValue,
      unit: payload.unit ?? null,
      confidence: payload.confidence ?? null,
      qualityFlagsJson: (payload.qualityFlags ?? []) as Prisma.InputJsonValue,
      typedValuesJson: (payload.typedValues ?? {}) as Prisma.InputJsonValue,
      capabilityStatus: cap,
    },
  });

  // Latest state only advances when observation is not older than current
  const priorState = await db.orbitMeasurementState.findUnique({
    where: {
      deviceId_measurementType: {
        deviceId: payload.deviceId,
        measurementType: payload.measurementType,
      },
    },
  });
  if (!priorState || priorState.observedAt <= observedAt) {
    await db.orbitMeasurementState.upsert({
      where: {
        deviceId_measurementType: {
          deviceId: payload.deviceId,
          measurementType: payload.measurementType,
        },
      },
      create: {
        deviceId: payload.deviceId,
        measurementType: payload.measurementType,
        observedAt,
        receivedAt,
        numericValue,
        textValue,
        unit: payload.unit ?? null,
        summaryJson: {
          bootId: payload.bootId,
          sessionId: payload.sessionId,
          sequence: payload.sequence,
          capabilityStatus: cap,
        },
      },
      update: {
        observedAt,
        receivedAt,
        numericValue,
        textValue,
        unit: payload.unit ?? null,
        summaryJson: {
          bootId: payload.bootId,
          sessionId: payload.sessionId,
          sequence: payload.sequence,
          capabilityStatus: cap,
        },
        updatedAt: new Date(),
      },
    });
  }

  await updateSeparatedState(db, {
    deviceId: payload.deviceId,
    tenantId: inbox.tenantId,
    deviceType: ctx.deviceType,
    measurementType: payload.measurementType,
    capability: cap,
    observedAt,
    receivedAt,
    numericValue,
    textValue,
    maxSkewMs: ctx.maxSkewMs ?? 120_000,
    staleAfterMs: ctx.staleAfterMs ?? 300_000,
  });

  if (numericValue != null) {
    for (const bucket of ["5m", "1h", "1d"] as const) {
      const start = bucketStart(observedAt, bucket);
      const existing = await db.orbitAggregate.findUnique({
        where: {
          deviceId_measurementType_bucket_bucketStart: {
            deviceId: payload.deviceId,
            measurementType: payload.measurementType,
            bucket,
            bucketStart: start,
          },
        },
      });
      if (!existing) {
        await db.orbitAggregate.create({
          data: {
            deviceId: payload.deviceId,
            tenantId: inbox.tenantId,
            measurementType: payload.measurementType,
            bucket,
            bucketStart: start,
            sampleCount: 1,
            minValue: numericValue,
            maxValue: numericValue,
            avgValue: numericValue,
            sumValue: numericValue,
          },
        });
      } else {
        const n = existing.sampleCount + 1;
        const sum = (existing.sumValue ?? 0) + numericValue;
        await db.orbitAggregate.update({
          where: { id: existing.id },
          data: {
            sampleCount: n,
            minValue: Math.min(existing.minValue ?? numericValue, numericValue),
            maxValue: Math.max(existing.maxValue ?? numericValue, numericValue),
            sumValue: sum,
            avgValue: sum / n,
            updatedAt: new Date(),
          },
        });
      }
    }
  }

  await db.orbitDevice.update({
    where: { id: payload.deviceId },
    data: { firmwareVersion: payload.firmwareVersion, lastSeenAt: receivedAt },
  });

  await db.orbitIngestInbox.update({
    where: { id: inbox.id },
    data: { processedAt: receivedAt, processError: null },
  });

  return {
    accepted: true as const,
    eventId: payload.eventId,
    capabilityStatus: cap,
    server: {
      receivedAt: receivedAt.toISOString(),
      authenticatedTenantId: ctx.authenticatedTenantId,
      ingestResult: "accepted" as const,
    },
  };
}

async function updateSeparatedState(
  db: Db,
  input: {
    deviceId: string;
    tenantId: string;
    deviceType: string;
    measurementType: string;
    capability: string;
    observedAt: Date;
    receivedAt: Date;
    numericValue: number | null;
    textValue: string | null;
    maxSkewMs: number;
    staleAfterMs: number;
  }
) {
  const state = await db.orbitDeviceState.findUnique({ where: { deviceId: input.deviceId } });

  if (
    input.measurementType === OrbitMeasurementType.HEARTBEAT ||
    input.measurementType === OrbitMeasurementType.CONNECTIVITY
  ) {
    const conn = connectivityFromHeartbeat({
      observedAt: input.observedAt,
      receivedAt: input.receivedAt,
      maxSkewMs: input.maxSkewMs,
      staleAfterMs: input.staleAfterMs,
    });
    if (conn.markOnlineNow) {
      const wasOnline = state?.online ?? false;
      await db.orbitDeviceState.upsert({
        where: { deviceId: input.deviceId },
        create: {
          deviceId: input.deviceId,
          online: true,
          health: "ok",
          lastHeartbeatAt: input.observedAt,
          sensorHealth: "unknown",
          screenPower: "unknown",
          playbackVerified: "unknown",
          summaryJson: { lastConnectivityReason: conn.reason },
        },
        update: {
          online: true,
          lastHeartbeatAt: input.observedAt,
          summaryJson: { lastConnectivityReason: conn.reason },
          updatedAt: new Date(),
        },
      });
      if (!wasOnline) {
        await enqueueOrbitEvent({
          deviceId: input.deviceId,
          eventType: OrbitEventType.DEVICE_CONNECTED,
          tenantId: input.tenantId,
          payload: {
            orbitDeviceId: input.deviceId,
            online: true,
            health: "ok",
            lastHeartbeatAt: input.observedAt.toISOString(),
            note: "Connectivity only — not screen power or playback",
          },
        });
      }
    } else {
      await db.orbitCoverageGap.create({
        data: {
          deviceId: input.deviceId,
          tenantId: input.tenantId,
          gapStart: input.observedAt,
          gapEnd: input.receivedAt,
          reason: conn.reason,
        },
      });
    }
    return;
  }

  // Unsupported capabilities must not mutate operational state flags
  if (input.capability !== "supported") {
    return;
  }

  const patch: Prisma.OrbitDeviceStateUpdateInput = {};
  if (input.measurementType === OrbitMeasurementType.SENSOR_HEALTH) {
    patch.sensorHealth = input.textValue ?? (input.numericValue != null ? "ok" : "unknown");
  }
  if (input.measurementType === OrbitMeasurementType.SCREEN_POWER) {
    patch.screenPower =
      input.textValue ?? (input.numericValue && input.numericValue > 0 ? "on" : "off");
  }
  if (input.measurementType === OrbitMeasurementType.PLAYBACK) {
    patch.playbackVerified = "verified";
  }
  if (
    input.measurementType === OrbitMeasurementType.POWER &&
    input.numericValue != null &&
    input.numericValue <= 0
  ) {
    await openOrExtendIncident(db, {
      deviceId: input.deviceId,
      tenantId: input.tenantId,
      kind: "power_loss",
      severity: "warning",
      at: input.observedAt,
    });
  }

  if (Object.keys(patch).length) {
    await db.orbitDeviceState.update({
      where: { deviceId: input.deviceId },
      data: { ...patch, updatedAt: new Date() },
    });
  }
}

async function openOrExtendIncident(
  db: Db,
  input: {
    deviceId: string;
    tenantId: string;
    kind: string;
    severity: string;
    at: Date;
  }
) {
  const open = await db.orbitIncident.findFirst({
    where: { deviceId: input.deviceId, kind: input.kind, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open) {
    await db.orbitIncident.update({
      where: { id: open.id },
      data: { updatedAt: new Date() },
    });
    return;
  }
  await db.orbitIncident.create({
    data: {
      deviceId: input.deviceId,
      tenantId: input.tenantId,
      kind: input.kind,
      severity: input.severity,
      startedAt: input.at,
      evidenceJson: { source: "measurement" },
    },
  });
}

export async function processPendingInbox(db: Db, limit = 50) {
  const pending = await db.orbitIngestInbox.findMany({
    where: { processedAt: null },
    orderBy: { receivedAt: "asc" },
    take: limit,
    include: { device: true },
  });
  const results = [];
  for (const row of pending) {
    if (row.device.revokedAt) {
      await db.orbitIngestInbox.update({
        where: { id: row.id },
        data: { processedAt: new Date(), processError: "revoked" },
      });
      results.push({ id: row.id, rejected: true, reason: "revoked" });
      continue;
    }
    const r = await processInboxItem(db, row.id, {
      authenticatedTenantId: row.tenantId,
      deviceId: row.deviceId,
      deviceType: row.device.deviceType,
    });
    results.push({ id: row.id, ...r });
  }
  return results;
}
