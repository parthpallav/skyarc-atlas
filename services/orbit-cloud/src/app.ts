import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Prisma } from "./generated/prisma/index.js";
import type { OrbitEnv } from "./env.js";
import { prisma } from "./prisma.js";
import { hashSecret, randomToken } from "./crypto.js";
import { applyHeartbeat } from "./state.js";
import { flushOutbox } from "./events.js";

type DeviceAuthRequest = FastifyRequest & {
  orbitDevice?: { id: string; revokedAt: Date | null; credentialHash: string | null };
};

function unauthorized(): Error & { statusCode: number } {
  const err = new Error("Unauthorized") as Error & { statusCode: number };
  err.statusCode = 401;
  return err;
}

export async function buildOrbitApp(env: OrbitEnv) {
  const app = Fastify({ logger: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply: FastifyReply) => {
    const status = err.statusCode ?? 500;
    reply.status(status).send({ error: { message: err.message } });
  });

  app.get("/health", async () => ({ status: "ok", service: "orbit-cloud" }));

  const serviceAuth = async (request: FastifyRequest) => {
    const header = String(request.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token !== env.ORBIT_SERVICE_TOKEN) throw unauthorized();
  };

  const deviceAuth = async (request: DeviceAuthRequest) => {
    const deviceId = String(request.headers["x-orbit-device-id"] ?? "");
    const secret = String(request.headers["x-orbit-device-secret"] ?? "");
    if (!deviceId || !secret) throw unauthorized();
    const device = await prisma.orbitDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt || !device.credentialHash) throw unauthorized();
    if (device.credentialHash !== hashSecret(secret)) throw unauthorized();
    request.orbitDevice = device;
  };

  app.post("/provision/v1/claim", async (request) => {
    await serviceAuth(request);
    const body = z
      .object({
        tenantId: z.string().default("skyarc"),
        atlasScreenId: z.string().uuid(),
        skyarcScreenCode: z.string().min(3),
        deviceType: z.string().default("orbit_edge"),
      })
      .parse(request.body);

    const device = await prisma.orbitDevice.create({
      data: {
        tenantId: body.tenantId,
        atlasScreenId: body.atlasScreenId,
        skyarcScreenCode: body.skyarcScreenCode.toUpperCase(),
        deviceType: body.deviceType,
        status: "pending",
      },
    });
    const claimCode = randomToken(18);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.claimCode.create({
      data: {
        deviceId: device.id,
        codeHash: hashSecret(claimCode),
        expiresAt,
      },
    });
    return {
      claimCode,
      expiresAt: expiresAt.toISOString(),
      orbitDeviceId: device.id,
    };
  });

  app.post("/provision/v1/enroll", async (request) => {
    const body = z.object({ claimCode: z.string().min(8) }).parse(request.body);
    const claim = await prisma.claimCode.findUnique({
      where: { codeHash: hashSecret(body.claimCode) },
      include: { device: true },
    });
    if (!claim || claim.usedAt || claim.expiresAt < new Date()) {
      throw unauthorized();
    }
    if (claim.device.revokedAt) throw unauthorized();

    const deviceSecret = randomToken(32);
    await prisma.$transaction([
      prisma.claimCode.update({
        where: { id: claim.id },
        data: { usedAt: new Date() },
      }),
      prisma.orbitDevice.update({
        where: { id: claim.deviceId },
        data: {
          credentialHash: hashSecret(deviceSecret),
          credentialVersion: { increment: 1 },
          status: "enrolled",
        },
      }),
      prisma.orbitDeviceState.upsert({
        where: { deviceId: claim.deviceId },
        create: { deviceId: claim.deviceId, online: false, health: "unknown" },
        update: {},
      }),
    ]);

    return {
      orbitDeviceId: claim.deviceId,
      deviceSecret,
      skyarcScreenCode: claim.device.skyarcScreenCode,
      atlasScreenId: claim.device.atlasScreenId,
    };
  });

  app.post("/devices/v1/:id/revoke", async (request) => {
    await serviceAuth(request);
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    await prisma.orbitDevice.update({
      where: { id },
      data: { revokedAt: new Date(), status: "revoked", credentialHash: null },
    });
    return { ok: true };
  });

  app.post("/ingest/v1/heartbeat", async (request) => {
    await deviceAuth(request as DeviceAuthRequest);
    const device = (request as DeviceAuthRequest).orbitDevice!;
    const now = new Date();
    await prisma.orbitTelemetry.create({
      data: {
        deviceId: device.id,
        observedAt: now,
        kind: "heartbeat",
        payloadJson: { at: now.toISOString() },
      },
    });
    await applyHeartbeat(device.id, now);
    await flushOutbox(env);
    return { ok: true };
  });

  app.post("/ingest/v1/telemetry", async (request) => {
    await deviceAuth(request as DeviceAuthRequest);
    const device = (request as DeviceAuthRequest).orbitDevice!;
    const body = z
      .object({
        samples: z
          .array(
            z.object({
              kind: z.string().min(1),
              observedAt: z.string().datetime().optional(),
              payload: z.record(z.unknown()).default({}),
            })
          )
          .min(1)
          .max(100),
      })
      .parse(request.body);

    const now = new Date();
    await prisma.orbitTelemetry.createMany({
      data: body.samples.map((s) => ({
        deviceId: device.id,
        observedAt: s.observedAt ? new Date(s.observedAt) : now,
        kind: s.kind,
        payloadJson: s.payload as Prisma.InputJsonValue,
      })),
    });
    await applyHeartbeat(device.id, now);
    await flushOutbox(env);
    return { ok: true, accepted: body.samples.length };
  });

  return app;
}
