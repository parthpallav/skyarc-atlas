/**
 * Isolated MQTT broker → Orbit consumer handler → PostgreSQL.
 * Embedded Aedes with auth + directional ACL; consumer uses the same
 * `handleInboundMqttMessage` path as production MQTT ingest.
 * Not physical-device / production-broker verified.
 *
 * Requires ORBIT_DATABASE_URL.
 */
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Aedes } from "aedes";
import mqtt from "mqtt";
import { PrismaClient } from "../generated/prisma/index.js";
import { hashSecret } from "../crypto.js";
import { processPendingInbox } from "../lib/ingest.js";
import {
  buildLunarHeartbeat,
  buildLunarStatus,
  buildSimulatedTelemetry,
} from "../lib/simulator.js";
import { handleInboundMqttMessage } from "../mqtt/consumer.js";
import type { OrbitEnv } from "../env.js";
import {
  lunarDeviceMayPublish,
  lunarDeviceMaySubscribe,
  lunarMqttUsername,
  orbitLunarMqttTopic,
  parseOrbitLunarMqttTopic,
  OrbitMeasurementType,
  ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS,
} from "@skyarc/shared";

const orbitUrl = process.env.ORBIT_DATABASE_URL?.trim();

function describeBroker(name: string, fn: () => void) {
  if (!orbitUrl) {
    describe.skip(`${name} (set ORBIT_DATABASE_URL)`, fn);
    return;
  }
  describe(name, fn);
}

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const intervalMs = opts?.intervalMs ?? 100;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("waitFor timeout");
}

describeBroker("orbit MQTT broker ingest (aedes + postgres)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: orbitUrl! } } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let broker: any;
  let server: ReturnType<typeof createServer> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consumerClient: any;
  let port = 0;
  const deviceSecret = `sec-${randomUUID()}`;
  const physicalDeviceId = `ORBIT-IT-${randomUUID().slice(0, 6).toUpperCase()}`;
  const mqttUser = lunarMqttUsername(physicalDeviceId);
  const clientIdentities = new Map<string, string>();
  let deviceId = "";
  let tenantId = "";
  const testEnv: OrbitEnv = {
    ORBIT_DATABASE_URL: orbitUrl!,
    ORBIT_SERVICE_TOKEN: "test-orbit-service-token-32c",
    ORBIT_WEBHOOK_SECRET: "test-orbit-webhook-secret-32",
    ATLAS_INTERNAL_URL: "http://127.0.0.1:3001",
    ORBIT_PORT: 3002,
    NODE_ENV: "test",
    ORBIT_HEARTBEAT_TIMEOUT_MS: 90_000,
    ORBIT_TELEMETRY_RETENTION_DAYS: 14,
    ORBIT_AGGREGATE_RETENTION_DAYS: 365,
    ORBIT_MAX_CLOCK_SKEW_MS: 120_000,
    ORBIT_STALE_OBSERVATION_MS: 300_000,
  };

  beforeAll(async () => {
    broker = await Aedes.createBroker({
      authenticate(
        client: { id: string },
        username: string | undefined,
        password: Buffer | undefined,
        done: (err: Error | null, success?: boolean) => void
      ) {
        const user = String(username ?? "");
        const pass = password?.toString("utf8") ?? "";
        if (user === "orbit-cloud" && pass === "orbit-cloud-pass") {
          clientIdentities.set(client.id, user);
          return done(null, true);
        }
        if (user === mqttUser && pass === deviceSecret) {
          clientIdentities.set(client.id, user);
          return done(null, true);
        }
        done(null, false);
      },
      authorizePublish(
        client: { id: string } | null,
        packet: { topic: string },
        done: (err: Error | null) => void
      ) {
        const parsed = parseOrbitLunarMqttTopic(packet.topic);
        if (!parsed) return done(new Error("bad topic"));
        const user = client ? clientIdentities.get(client.id) ?? "" : "";
        if (user === "orbit-cloud") {
          if (
            lunarDeviceMaySubscribe(
              parsed.physicalDeviceId,
              parsed.physicalDeviceId,
              parsed.channel
            )
          ) {
            return done(null);
          }
          return done(new Error("cloud cannot publish device uplink"));
        }
        if (user === mqttUser) {
          if (
            !lunarDeviceMayPublish(
              physicalDeviceId,
              parsed.physicalDeviceId,
              parsed.channel
            )
          ) {
            return done(new Error("device ACL deny publish"));
          }
          return done(null);
        }
        done(new Error("unauthenticated publish"));
      },
      authorizeSubscribe(
        client: { id: string } | null,
        sub: { topic: string },
        done: (err: Error | null, subscription?: { topic: string } | null) => void
      ) {
        const user = client ? clientIdentities.get(client.id) ?? "" : "";
        if (user === "orbit-cloud") return done(null, sub);
        const parsed = parseOrbitLunarMqttTopic(sub.topic);
        if (!parsed) return done(new Error("bad subscribe topic"));
        if (
          !lunarDeviceMaySubscribe(
            physicalDeviceId,
            parsed.physicalDeviceId,
            parsed.channel
          )
        ) {
          return done(new Error("device ACL deny subscribe"));
        }
        done(null, sub);
      },
    });
    server = createServer(broker.handle);
    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", () => {
        const addr = server!.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });

    tenantId = `tenant-${randomUUID().slice(0, 8)}`;
    const device = await prisma.orbitDevice.create({
      data: {
        tenantId,
        atlasScreenId: randomUUID(),
        skyarcScreenCode: `SCR-${randomUUID().slice(0, 6).toUpperCase()}`,
        physicalDeviceId,
        mqttUsername: mqttUser,
        deviceType: "orbit_edge",
        status: "enrolled",
        credentialHash: hashSecret(deviceSecret),
        credentialVersion: 1,
      },
    });
    deviceId = device.id;
    await prisma.orbitDeviceState.create({
      data: {
        deviceId,
        online: false,
        health: "unknown",
        sensorHealth: "unknown",
        screenPower: "unknown",
        playbackVerified: "unknown",
      },
    });

    // Production-shaped consumer: subscribe via broker, handle with Orbit consumer path
    await new Promise<void>((resolve, reject) => {
      consumerClient = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
        clientId: `orbit-cloud-ingest-test`,
        username: "orbit-cloud",
        password: "orbit-cloud-pass",
        reconnectPeriod: 0,
        connectTimeout: 5_000,
        protocolVersion: 4, // Aedes: MQTT 3.1.1 — see mqtt5 suite for MQTT 5.0
      });
      consumerClient.on("error", reject);
      consumerClient.on("connect", () => {
        let pending = ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS.length;
        for (const channel of ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS) {
          consumerClient.subscribe(`skyarc/v1/orbit/+/${channel}`, { qos: 1 }, (err: Error | null) => {
            if (err) reject(err);
            pending -= 1;
            if (pending === 0) resolve();
          });
        }
      });
      consumerClient.on("message", (topic: string, buf: Buffer) => {
        void handleInboundMqttMessage(testEnv, topic, buf, prisma);
      });
    });
  });

  afterAll(async () => {
    if (consumerClient) {
      await new Promise<void>((resolve) => consumerClient.end(true, {}, () => resolve()));
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (broker) {
      await new Promise<void>((resolve) => broker.close(() => resolve()));
    }
    if (deviceId) {
      await prisma.orbitIngestInbox.deleteMany({ where: { deviceId } });
      await prisma.orbitIngestFailure.deleteMany({ where: { deviceId } });
      await prisma.orbitRawEvent.deleteMany({ where: { deviceId } });
      await prisma.orbitMeasurement.deleteMany({ where: { deviceId } });
      await prisma.orbitMeasurementState.deleteMany({ where: { deviceId } });
      await prisma.orbitCoverageGap.deleteMany({ where: { deviceId } });
      await prisma.orbitIncident.deleteMany({ where: { deviceId } });
      await prisma.orbitAggregate.deleteMany({ where: { deviceId } }).catch(() => undefined);
      await prisma.orbitDeviceState.deleteMany({ where: { deviceId } });
      await prisma.orbitDevice.deleteMany({ where: { id: deviceId } });
    }
    await prisma.$disconnect();
  });

  it("rejects bad credentials and unauthorized publish topics", async () => {
    let badAuthConnected = false;
    await new Promise<void>((resolve) => {
      const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
        clientId: `bad-auth-${randomUUID().slice(0, 6)}`,
        username: mqttUser,
        password: "wrong-secret",
        reconnectPeriod: 0,
        connectTimeout: 2_000,
      });
      const finish = () => {
        try {
          client.end(true);
        } catch {
          /* ignore */
        }
        resolve();
      };
      client.on("connect", () => {
        badAuthConnected = true;
        finish();
      });
      client.on("error", finish);
      client.on("close", finish);
      setTimeout(finish, 2_500);
    });
    expect(badAuthConnected).toBe(false);

    let publishSucceeded = false;
    let publishErrored = false;
    await new Promise<void>((resolve) => {
      const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
        clientId: `device-acl-${physicalDeviceId}`,
        username: mqttUser,
        password: deviceSecret,
        reconnectPeriod: 0,
        connectTimeout: 2_000,
      });
      const finish = () => {
        try {
          client.end(true);
        } catch {
          /* ignore */
        }
        resolve();
      };
      client.on("connect", () => {
        const badTopic = orbitLunarMqttTopic(physicalDeviceId, "commands");
        client.publish(badTopic, "{}", { qos: 1 }, (err) => {
          if (err) publishErrored = true;
          else publishSucceeded = true;
          finish();
        });
      });
      client.on("error", () => {
        publishErrored = true;
        finish();
      });
      setTimeout(finish, 2_500);
    });
    expect(publishSucceeded).toBe(false);
    expect(publishErrored).toBe(true);
  }, 15_000);

  it("publishes permitted uplink through broker into durable postgres (dedupe + reconnect)", async () => {
    const messageId = `msg_hb_${randomUUID().slice(0, 8)}`;
    const { topic, envelope } = buildLunarHeartbeat(physicalDeviceId, {
      messageId,
    });

    for (let i = 0; i < 2; i++) {
      await new Promise<void>((resolve, reject) => {
        const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
          clientId: `device-${physicalDeviceId}-${i}`,
          username: mqttUser,
          password: deviceSecret,
          clean: false,
          reconnectPeriod: 0,
          protocolVersion: 4, // Aedes: MQTT 3.1.1 — see mqtt5 suite for MQTT 5.0
        });
        client.on("connect", () => {
          client.publish(topic, JSON.stringify(envelope), { qos: 1 }, (err) => {
            client.end(false, {}, () => (err ? reject(err) : resolve()));
          });
        });
        client.on("error", reject);
      });
    }

    const inbox = await waitFor(async () =>
      prisma.orbitIngestInbox.findFirst({
        where: { deviceId, eventId: messageId, processedAt: { not: null } },
      })
    );
    expect(inbox.processedAt).toBeTruthy();

    // Second consumer delivery of same messageId must not create a second inbox row
    const count = await prisma.orbitIngestInbox.count({
      where: { deviceId, eventId: messageId },
    });
    expect(count).toBe(1);
  }, 20_000);

  it("ignores stale retained ONLINE and applies LWT OFFLINE without false online", async () => {
    await prisma.orbitDeviceState.update({
      where: { deviceId },
      data: { online: false, lastHeartbeatAt: null, health: "unknown" },
    });

    const staleStatus = buildLunarStatus(physicalDeviceId, "ONLINE", {
      timestamp: new Date("2020-01-01T00:00:00Z"),
      messageId: `msg_stale_${randomUUID().slice(0, 8)}`,
    });
    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
        clientId: `device-stale-${physicalDeviceId}`,
        username: mqttUser,
        password: deviceSecret,
        reconnectPeriod: 0,
        protocolVersion: 4, // Aedes: MQTT 3.1.1 — see mqtt5 suite for MQTT 5.0
      });
      client.on("connect", () => {
        client.publish(
          staleStatus.topic,
          JSON.stringify(staleStatus.envelope),
          { qos: 1 },
          (err) => client.end(false, {}, () => (err ? reject(err) : resolve()))
        );
      });
      client.on("error", reject);
    });

    await waitFor(async () =>
      prisma.orbitIngestInbox.findFirst({
        where: { deviceId, eventId: staleStatus.envelope.messageId },
      })
    );
    const state = await prisma.orbitDeviceState.findUnique({ where: { deviceId } });
    expect(state?.online).toBe(false);

    await prisma.orbitDeviceState.update({
      where: { deviceId },
      data: { online: false, lastHeartbeatAt: new Date() },
    });

    const lwt = buildLunarStatus(physicalDeviceId, "OFFLINE", {
      timestamp: new Date("2020-01-02T00:00:00Z"),
      messageId: `msg_lwt_${randomUUID().slice(0, 8)}`,
    });
    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
        clientId: `device-lwt-${physicalDeviceId}`,
        username: mqttUser,
        password: deviceSecret,
        reconnectPeriod: 0,
        protocolVersion: 4, // Aedes: MQTT 3.1.1 — see mqtt5 suite for MQTT 5.0
      });
      client.on("connect", () => {
        client.publish(lwt.topic, JSON.stringify(lwt.envelope), { qos: 1 }, (err) =>
          client.end(false, {}, () => (err ? reject(err) : resolve()))
        );
      });
      client.on("error", reject);
    });

    await waitFor(async () =>
      prisma.orbitIngestInbox.findFirst({
        where: { deviceId, eventId: lwt.envelope.messageId },
      })
    );
    const after = await prisma.orbitDeviceState.findUnique({ where: { deviceId } });
    expect(after?.online).toBe(false);
  }, 20_000);

  it("rejects payload credentials — broker auth only", async () => {
    const messageId = `msg_sec_${randomUUID().slice(0, 8)}`;
    const { topic, envelope } = buildLunarHeartbeat(physicalDeviceId, {
      messageId,
      mqttSecret: "must-not-be-accepted",
    });
    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
        clientId: `device-sec-${physicalDeviceId}`,
        username: mqttUser,
        password: deviceSecret,
        reconnectPeriod: 0,
        protocolVersion: 4,
      });
      client.on("connect", () => {
        client.publish(topic, JSON.stringify(envelope), { qos: 1 }, (err) =>
          client.end(false, {}, () => (err ? reject(err) : resolve()))
        );
      });
      client.on("error", reject);
    });

    const failure = await waitFor(async () =>
      prisma.orbitIngestFailure.findFirst({
        where: { topic, reason: { contains: "must not contain device credentials" } },
      })
    );
    expect(failure).toBeTruthy();
    expect(String(failure.payloadPreview ?? "")).not.toContain("must-not-be-accepted");
    const inbox = await prisma.orbitIngestInbox.findFirst({
      where: { deviceId, eventId: messageId },
    });
    expect(inbox).toBeNull();
  }, 15_000);

  it("recovers unprocessed inbox after consumer restart", async () => {
    const payload = buildSimulatedTelemetry({
      deviceId,
      measurementType: OrbitMeasurementType.HEARTBEAT,
      value: 1,
    });
    await prisma.orbitIngestInbox.create({
      data: {
        eventId: payload.eventId,
        deviceId,
        tenantId,
        topic: orbitLunarMqttTopic(physicalDeviceId, "heartbeat"),
        channel: "heartbeat",
        schemaFamily: "7b.v1",
        payloadJson: payload,
        receivedAt: new Date(),
        processedAt: null,
      },
    });

    const results = await processPendingInbox(prisma, 50);
    expect(results.some((r) => r.id)).toBe(true);
    const row = await prisma.orbitIngestInbox.findFirst({
      where: { eventId: payload.eventId },
    });
    expect(row?.processedAt).toBeTruthy();
  });
});
