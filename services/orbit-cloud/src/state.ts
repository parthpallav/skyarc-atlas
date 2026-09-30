import { OrbitEventType } from "@skyarc/shared";
import { prisma } from "./prisma.js";
import { enqueueOrbitEvent } from "./events.js";

export async function applyHeartbeat(deviceId: string, observedAt: Date) {
  const prior = await prisma.orbitDeviceState.findUnique({ where: { deviceId } });
  const wasOnline = prior?.online ?? false;

  await prisma.orbitDeviceState.upsert({
    where: { deviceId },
    create: {
      deviceId,
      online: true,
      health: "ok",
      lastHeartbeatAt: observedAt,
      summaryJson: { lastHeartbeatAt: observedAt.toISOString() },
    },
    update: {
      online: true,
      health: "ok",
      lastHeartbeatAt: observedAt,
      summaryJson: { lastHeartbeatAt: observedAt.toISOString() },
    },
  });
  await prisma.orbitDevice.update({
    where: { id: deviceId },
    data: { lastSeenAt: observedAt, status: "online", health: "ok" },
  });

  if (!wasOnline) {
    await enqueueOrbitEvent({
      deviceId,
      eventType: OrbitEventType.DEVICE_CONNECTED,
      payload: {
        orbitDeviceId: deviceId,
        online: true,
        health: "ok",
        lastHeartbeatAt: observedAt.toISOString(),
      },
    });
  }
}

export async function markStaleDevicesOffline(timeoutMs: number) {
  const cutoff = new Date(Date.now() - timeoutMs);
  const stale = await prisma.orbitDeviceState.findMany({
    where: { online: true, lastHeartbeatAt: { lt: cutoff } },
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
