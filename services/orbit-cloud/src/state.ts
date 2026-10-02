import { OrbitEventType } from "@skyarc/shared";
import { prisma } from "./prisma.js";
import { enqueueOrbitEvent } from "./events.js";
import { connectivityFromHeartbeat } from "@skyarc/shared";

/**
 * Legacy heartbeat path — connectivity only.
 * Does not imply screen power or campaign playback.
 */
export async function applyHeartbeat(
  deviceId: string,
  observedAt: Date,
  opts?: { tenantId?: string; receivedAt?: Date; maxSkewMs?: number; staleAfterMs?: number }
) {
  const receivedAt = opts?.receivedAt ?? new Date();
  const conn = connectivityFromHeartbeat({
    observedAt,
    receivedAt,
    maxSkewMs: opts?.maxSkewMs ?? 120_000,
    staleAfterMs: opts?.staleAfterMs ?? 300_000,
  });

  const device = await prisma.orbitDevice.findUnique({ where: { id: deviceId } });
  if (!device) return { error: "Device not found" as const };

  if (!conn.markOnlineNow) {
    await prisma.orbitCoverageGap.create({
      data: {
        deviceId,
        tenantId: device.tenantId,
        gapStart: observedAt,
        gapEnd: receivedAt,
        reason: conn.reason,
      },
    });
    return { online: false as const, reason: conn.reason };
  }

  const prior = await prisma.orbitDeviceState.findUnique({ where: { deviceId } });
  const wasOnline = prior?.online ?? false;

  await prisma.orbitDeviceState.upsert({
    where: { deviceId },
    create: {
      deviceId,
      online: true,
      health: "ok",
      lastHeartbeatAt: observedAt,
      sensorHealth: "unknown",
      screenPower: "unknown",
      playbackVerified: "unknown",
      summaryJson: { lastHeartbeatAt: observedAt.toISOString(), note: conn.reason },
    },
    update: {
      online: true,
      health: "ok",
      lastHeartbeatAt: observedAt,
      summaryJson: { lastHeartbeatAt: observedAt.toISOString(), note: conn.reason },
    },
  });
  await prisma.orbitDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: receivedAt, status: "online", health: "ok" },
  });

  if (!wasOnline) {
    await enqueueOrbitEvent({
      deviceId,
      tenantId: opts?.tenantId ?? device.tenantId,
      eventType: OrbitEventType.DEVICE_CONNECTED,
      payload: {
        orbitDeviceId: deviceId,
        online: true,
        health: "ok",
        lastHeartbeatAt: observedAt.toISOString(),
        note: "Connectivity only — not screen power or playback",
      },
    });
  }
  return { online: true as const };
}

export async function markStaleDevicesOffline(timeoutMs: number) {
  const cutoff = new Date(Date.now() - timeoutMs);
  const stale = await prisma.orbitDeviceState.findMany({
    where: { online: true, lastHeartbeatAt: { lt: cutoff } },
    include: { device: true },
  });
  for (const row of stale) {
    await prisma.orbitDeviceState.update({
      where: { deviceId: row.deviceId },
      data: { online: false, health: "offline" },
    });
    await prisma.orbitDevice.update({
      where: { id: row.deviceId },
      data: { status: "offline", health: "offline" },
    });
    await enqueueOrbitEvent({
      deviceId: row.deviceId,
      tenantId: row.device.tenantId,
      eventType: OrbitEventType.DEVICE_DISCONNECTED,
      payload: {
        orbitDeviceId: row.deviceId,
        online: false,
        health: "offline",
        lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
      },
    });
  }
}
