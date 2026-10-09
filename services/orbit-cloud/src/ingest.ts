import type { Prisma } from "./generated/prisma/index.js";
import { prisma } from "./prisma.js";
import { applyHeartbeat } from "./state.js";
import { flushOutbox } from "./events.js";
import type { OrbitEnv } from "./env.js";

export type TelemetrySampleInput = {
  kind: string;
  observedAt?: string;
  payload?: Record<string, unknown>;
};

/** Shared by HTTPS /ingest and MQTT bridge. */
export async function ingestHeartbeat(
  env: OrbitEnv,
  deviceId: string,
  observedAt: Date = new Date()
): Promise<{ ok: true }> {
  await prisma.orbitTelemetry.create({
    data: {
      deviceId,
      observedAt,
      kind: "heartbeat",
      payloadJson: { at: observedAt.toISOString() },
    },
  });
  await applyHeartbeat(deviceId, observedAt);
  await flushOutbox(env);
  return { ok: true };
}

export async function ingestTelemetry(
  env: OrbitEnv,
  deviceId: string,
  samples: TelemetrySampleInput[]
): Promise<{ ok: true; accepted: number }> {
  const now = new Date();
  await prisma.orbitTelemetry.createMany({
    data: samples.map((s) => ({
      deviceId,
      observedAt: s.observedAt ? new Date(s.observedAt) : now,
      kind: s.kind,
      payloadJson: (s.payload ?? {}) as Prisma.InputJsonValue,
    })),
  });
  await applyHeartbeat(deviceId, now);
  await flushOutbox(env);
  return { ok: true, accepted: samples.length };
}

export async function assertDeviceIngestable(deviceId: string): Promise<{
  id: string;
  tenantId: string;
}> {
  const device = await prisma.orbitDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.revokedAt || !device.credentialHash) {
    throw Object.assign(new Error("Device not enrolled or revoked"), { statusCode: 401 });
  }
  if (device.status === "pending") {
    throw Object.assign(new Error("Device not enrolled"), { statusCode: 401 });
  }
  return { id: device.id, tenantId: device.tenantId };
}
