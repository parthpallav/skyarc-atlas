import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import { DeviceProvider, DeviceStatus, OrbitEventType } from "@skyarc/shared";
import { orbitEventEnvelopeSchema } from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { unauthorized, validationError } from "../../lib/errors.js";

function verifyHmac(secret: string, rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function orbitEventRoutes(fastify: FastifyInstance, env: Env) {
  fastify.post("/internal/orbit/events", async (request) => {
    if (!env.ORBIT_WEBHOOK_SECRET) {
      throw validationError("Orbit webhook is not configured");
    }
    const raw = typeof request.body === "string" ? request.body : "";
    if (!raw) throw validationError("Raw JSON body required");
    const signature = request.headers["x-orbit-signature"];
    if (
      !verifyHmac(
        env.ORBIT_WEBHOOK_SECRET,
        raw,
        typeof signature === "string" ? signature : undefined
      )
    ) {
      throw unauthorized("Invalid Orbit signature");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw validationError("Invalid JSON");
    }
    const event = orbitEventEnvelopeSchema.parse(parsed);

    const existing = await prisma.orbitEventReceipt.findUnique({
      where: { eventId: event.eventId },
    });
    if (existing) {
      return success({ ok: true, duplicate: true });
    }

    const orbitDeviceId = String(event.payload.orbitDeviceId ?? "");
    if (!orbitDeviceId) throw validationError("payload.orbitDeviceId required");

    const device = await prisma.device.findUnique({
      where: {
        provider_externalId: {
          provider: DeviceProvider.ORBIT,
          externalId: orbitDeviceId,
        },
      },
    });
    if (!device) {
      await prisma.orbitEventReceipt.create({
        data: { eventId: event.eventId, eventType: event.eventType },
      });
      return success({ ok: true, ignored: true });
    }

    let status = device.status;
    if (event.eventType === OrbitEventType.DEVICE_CONNECTED) status = DeviceStatus.ONLINE;
    if (event.eventType === OrbitEventType.DEVICE_DISCONNECTED) {
      status = DeviceStatus.OFFLINE;
    }
    if (event.eventType === OrbitEventType.DEVICE_HEALTH_CHANGED) {
      status = DeviceStatus.ONLINE;
    }

    const prior =
      typeof device.summaryJson === "object" &&
      device.summaryJson &&
      !Array.isArray(device.summaryJson)
        ? { ...(device.summaryJson as Record<string, unknown>) }
        : {};
    delete prior.claimCode;
    delete prior.claimExpiresAt;
    const summary = {
      ...prior,
      lastEventType: event.eventType,
      health: event.payload.health ?? null,
      online: event.payload.online ?? status === DeviceStatus.ONLINE,
      lastHeartbeatAt: event.payload.lastHeartbeatAt ?? event.timestamp,
    };

    await prisma.$transaction([
      prisma.device.update({
        where: { id: device.id },
        data: {
          status,
          summaryJson: summary,
          lastEventAt: new Date(event.timestamp),
        },
      }),
      prisma.orbitEventReceipt.create({
        data: { eventId: event.eventId, eventType: event.eventType },
      }),
    ]);

    return success({ ok: true, deviceId: device.id, status });
  });
}
