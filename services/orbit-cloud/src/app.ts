import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Prisma } from "./generated/prisma/index.js";
import type { OrbitEnv } from "./env.js";
import { prisma } from "./prisma.js";
import { hashSecret, randomToken, timingSafeStringEqual } from "./crypto.js";
import { applyHeartbeat } from "./state.js";
import { flushOutbox } from "./events.js";
import {
  acceptIntoInbox,
  processInboxItem,
  processPendingInbox,
  validateTelemetryBytes,
} from "./lib/ingest.js";
import { applyRetentionPolicies } from "./lib/retention.js";
import { orbitTelemetryPayloadV1Schema } from "./lib/payload.js";
import { OrbitDeviceCapabilityProfile } from "@skyarc/shared";

type DeviceAuthRequest = FastifyRequest & {
  orbitDevice?: {
    id: string;
    tenantId: string;
    deviceType: string;
    revokedAt: Date | null;
    credentialHash: string | null;
  };
};

function unauthorized(): Error & { statusCode: number } {
  const err = new Error("Unauthorized") as Error & { statusCode: number };
  err.statusCode = 401;
  return err;
}

export async function buildOrbitApp(env: OrbitEnv) {
  const app = Fastify({ logger: true, bodyLimit: 32_768 });
  await app.register(helmet);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply: FastifyReply) => {
    const status = err.statusCode ?? 500;
    reply.status(status).send({ error: { message: err.message } });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "orbit-cloud",
    mqttConfigured: Boolean(env.ORBIT_MQTT_URL),
  }));

  const serviceAuth = async (request: FastifyRequest) => {
    const header = String(request.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!timingSafeStringEqual(token, env.ORBIT_SERVICE_TOKEN)) throw unauthorized();
  };

  const deviceAuth = async (request: DeviceAuthRequest) => {
    const deviceId = String(request.headers["x-orbit-device-id"] ?? "");
    const secret = String(request.headers["x-orbit-device-secret"] ?? "");
    if (!deviceId || !secret) throw unauthorized();
    const device = await prisma.orbitDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt || !device.credentialHash) throw unauthorized();
    if (!timingSafeStringEqual(device.credentialHash, hashSecret(secret))) throw unauthorized();
    request.orbitDevice = device;
  };

  app.post("/provision/v1/claim", async (request) => {
    await serviceAuth(request);
    const body = z
      .object({
        tenantId: z.string().min(1),
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
    const profile =
      Object.values(OrbitDeviceCapabilityProfile).find((p) => p.deviceType === body.deviceType) ??
      OrbitDeviceCapabilityProfile.ORBIT_EDGE;
    await prisma.orbitDeviceCapability.create({
      data: {
        deviceId: device.id,
        version: 1,
        effectiveFrom: new Date(),
        capabilitiesJson: {
          supported: [...profile.supported],
          unsupportedByDefault: [...profile.unsupportedByDefault],
          cameraImagesEnabled: false,
        },
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
      tenantId: device.tenantId,
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
        create: {
          deviceId: claim.deviceId,
          online: false,
          health: "unknown",
          sensorHealth: "unknown",
          screenPower: "unknown",
          playbackVerified: "unknown",
        },
        update: {},
      }),
    ]);

    return {
      orbitDeviceId: claim.deviceId,
      deviceSecret,
      skyarcScreenCode: claim.device.skyarcScreenCode,
      atlasScreenId: claim.device.atlasScreenId,
      tenantId: claim.device.tenantId,
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

  /** Legacy heartbeat — connectivity only. Prefer /ingest/v1/events. */
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
    await applyHeartbeat(device.id, now, { tenantId: device.tenantId, receivedAt: now });
    await flushOutbox(env);
    return { ok: true, note: "Connectivity only — not screen power or playback" };
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
    await applyHeartbeat(device.id, now, { tenantId: device.tenantId, receivedAt: now });
    await flushOutbox(env);
    return { ok: true, accepted: body.samples.length };
  });

  /**
   * Phase 7B versioned telemetry (HTTPS path — same contract as MQTT).
   * Durable inbox first, then normalize.
   */
  app.post("/ingest/v1/events", async (request) => {
    await deviceAuth(request as DeviceAuthRequest);
    const device = (request as DeviceAuthRequest).orbitDevice!;
    const raw =
      typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
    const size = validateTelemetryBytes(raw);
    if (!size.ok) {
      await prisma.orbitIngestFailure.create({
        data: {
          deviceId: device.id,
          tenantId: device.tenantId,
          reason: size.reason,
        },
      });
      return { ok: false, ingestResult: "rejected", rejectReason: size.reason };
    }
    let json: unknown;
    try {
      json = JSON.parse(size.text);
    } catch {
      return { ok: false, ingestResult: "rejected", rejectReason: "Invalid JSON" };
    }
    const schema = orbitTelemetryPayloadV1Schema.safeParse(json);
    if (!schema.success) {
      await prisma.orbitIngestFailure.create({
        data: {
          deviceId: device.id,
          tenantId: device.tenantId,
          reason: schema.error.issues.map((i) => i.message).join("; "),
          payloadPreview: size.text.slice(0, 200),
        },
      });
      return {
        ok: false,
        ingestResult: "rejected",
        rejectReason: "schema_invalid",
        receivedAt: new Date().toISOString(),
        authenticatedTenantId: device.tenantId,
      };
    }

    const accepted = await acceptIntoInbox(prisma, {
      deviceId: device.id,
      tenantId: device.tenantId,
      topic: null,
      payload: schema.data,
    });
    if ("error" in accepted) {
      return { ok: false, ingestResult: "rejected", rejectReason: accepted.error };
    }
    if (accepted.duplicate) {
      return {
        ok: true,
        ingestResult: "duplicate",
        eventId: schema.data.eventId,
        receivedAt: new Date().toISOString(),
        authenticatedTenantId: device.tenantId,
      };
    }

    const processed = await processInboxItem(prisma, accepted.inbox.id, {
      authenticatedTenantId: device.tenantId,
      deviceId: device.id,
      deviceType: device.deviceType,
      maxSkewMs: env.ORBIT_MAX_CLOCK_SKEW_MS,
      staleAfterMs: env.ORBIT_STALE_OBSERVATION_MS,
    });
    await flushOutbox(env);
    return {
      ok: !("rejected" in processed),
      ...processed,
      receivedAt: new Date().toISOString(),
      authenticatedTenantId: device.tenantId,
    };
  });

  app.post("/ingest/v1/events/batch", async (request) => {
    await deviceAuth(request as DeviceAuthRequest);
    const device = (request as DeviceAuthRequest).orbitDevice!;
    const body = z
      .object({
        events: z.array(z.unknown()).min(1).max(100),
      })
      .parse(request.body);
    const results = [];
    for (const ev of body.events) {
      const schema = orbitTelemetryPayloadV1Schema.safeParse(ev);
      if (!schema.success) {
        results.push({ ingestResult: "rejected", reason: "schema_invalid" });
        continue;
      }
      const accepted = await acceptIntoInbox(prisma, {
        deviceId: device.id,
        tenantId: device.tenantId,
        payload: schema.data,
      });
      if ("error" in accepted) {
        results.push({ ingestResult: "rejected", reason: accepted.error });
        continue;
      }
      if (accepted.duplicate) {
        results.push({ ingestResult: "duplicate", eventId: schema.data.eventId });
        continue;
      }
      const processed = await processInboxItem(prisma, accepted.inbox.id, {
        authenticatedTenantId: device.tenantId,
        deviceId: device.id,
        deviceType: device.deviceType,
        maxSkewMs: env.ORBIT_MAX_CLOCK_SKEW_MS,
        staleAfterMs: env.ORBIT_STALE_OBSERVATION_MS,
      });
      results.push(processed);
    }
    await flushOutbox(env);
    return { ok: true, results, note: "Offline replay batch — stale events do not mark online now" };
  });

  app.post("/admin/v1/inbox/process", async (request) => {
    await serviceAuth(request);
    const results = await processPendingInbox(prisma, 100);
    await flushOutbox(env);
    return { processed: results.length, results };
  });

  app.post("/admin/v1/retention/run", async (request) => {
    await serviceAuth(request);
    const result = await applyRetentionPolicies(prisma, env);
    return result;
  });

  app.get("/devices/v1/:id/state", async (request) => {
    await serviceAuth(request);
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const device = await prisma.orbitDevice.findUnique({
      where: { id },
      include: {
        state: true,
        measureState: true,
        capabilities: { orderBy: { version: "desc" }, take: 1 },
        incidents: { where: { endedAt: null }, take: 20 },
      },
    });
    if (!device) {
      const err = new Error("Not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    return {
      device: {
        id: device.id,
        tenantId: device.tenantId,
        atlasScreenId: device.atlasScreenId,
        deviceType: device.deviceType,
        status: device.status,
        firmwareVersion: device.firmwareVersion,
        revokedAt: device.revokedAt?.toISOString() ?? null,
      },
      connectivity: device.state
        ? {
            online: device.state.online,
            lastHeartbeatAt: device.state.lastHeartbeatAt?.toISOString() ?? null,
            health: device.state.health,
          }
        : null,
      sensorHealth: device.state?.sensorHealth ?? "unknown",
      screenPower: device.state?.screenPower ?? "unknown",
      playbackVerified: device.state?.playbackVerified ?? "unknown",
      measurements: device.measureState.map((m) => ({
        measurementType: m.measurementType,
        observedAt: m.observedAt.toISOString(),
        numericValue: m.numericValue,
        textValue: m.textValue,
      })),
      openIncidents: device.incidents.map((i) => ({
        id: i.id,
        kind: i.kind,
        severity: i.severity,
        startedAt: i.startedAt.toISOString(),
      })),
      capabilityVersion: device.capabilities[0]?.version ?? null,
      limitations: [
        "Heartbeat/connectivity does not imply screen power or campaign playback",
        "Traffic observations require Orbit Edge Sense capability",
        "Trusted playback attribution requires CMS/player creative/campaign identifiers",
        "Camera images are not collected by default",
      ],
    };
  });

  return app;
}
