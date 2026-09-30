import { randomUUID } from "node:crypto";
import { ORBIT_TENANT_ID, OrbitEventType } from "@skyarc/shared";
import type { Prisma } from "./generated/prisma/index.js";
import type { OrbitEnv } from "./env.js";
import { prisma } from "./prisma.js";
import { signBody } from "./crypto.js";

export async function enqueueOrbitEvent(input: {
  deviceId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const eventId = randomUUID();
  await prisma.orbitEventOutbox.create({
    data: {
      eventId,
      deviceId: input.deviceId,
      eventType: input.eventType,
      tenantId: ORBIT_TENANT_ID,
      payloadJson: input.payload as Prisma.InputJsonValue,
    },
  });
  return eventId;
}

export async function flushOutbox(env: OrbitEnv): Promise<number> {
  const pending = await prisma.orbitEventOutbox.findMany({
    where: { deliveredAt: null },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  let delivered = 0;
  for (const row of pending) {
    const envelope = {
      eventId: row.eventId,
      eventType: row.eventType,
      version: row.version,
      tenantId: row.tenantId,
      timestamp: row.createdAt.toISOString(),
      source: "orbit-cloud" as const,
      payload: row.payloadJson as Record<string, unknown>,
    };
    const body = JSON.stringify(envelope);
    const signature = signBody(env.ORBIT_WEBHOOK_SECRET, body);
    try {
      const res = await fetch(
        `${env.ATLAS_INTERNAL_URL.replace(/\/$/, "")}/api/v1/internal/orbit/events`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-orbit-signature": signature,
          },
          body,
        }
      );
      if (res.ok) {
        await prisma.orbitEventOutbox.update({
          where: { eventId: row.eventId },
          data: { deliveredAt: new Date() },
        });
        delivered += 1;
      }
    } catch {
      // retry next tick
    }
  }
  return delivered;
}

export { OrbitEventType };
