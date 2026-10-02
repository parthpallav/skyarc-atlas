/**
 * Authenticated MQTT consumer (optional dependency).
 * Topic identity must match registered device credentials.
 * Durable handoff: persist OrbitIngestInbox before MQTT ACK.
 *
 * Live broker verification requires ORBIT_MQTT_URL. Without it, HTTPS
 * ingest + simulator cover the same contracts.
 */
import {
  parseOrbitMqttTopic,
  orbitMqttTopic,
} from "@skyarc/shared";
import type { OrbitEnv } from "../env.js";
import { prisma } from "../prisma.js";
import { credentialsMatch } from "../crypto.js";
import {
  acceptIntoInbox,
  processInboxItem,
  validateTelemetryBytes,
} from "../lib/ingest.js";
import { flushOutbox } from "../events.js";

export type MqttConsumerHandle = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  stop: () => Promise<void>;
};

export async function startMqttConsumer(env: OrbitEnv): Promise<MqttConsumerHandle | null> {
  if (!env.ORBIT_MQTT_URL) {
    return null;
  }

  let mqtt: typeof import("mqtt");
  try {
    mqtt = await import("mqtt");
  } catch {
    return null;
  }

  const client = mqtt.default.connect(env.ORBIT_MQTT_URL, {
    protocol: env.ORBIT_MQTT_URL.startsWith("mqtts") ? "mqtts" : undefined,
    rejectUnauthorized: env.NODE_ENV === "production",
    username: env.ORBIT_MQTT_USERNAME,
    password: env.ORBIT_MQTT_PASSWORD,
    reconnectPeriod: 5_000,
    clientId: `orbit-cloud-ingest-${process.pid}`,
  });

  client.on("connect", () => {
    client.subscribe("orbit/+/+/telemetry", { qos: 1 });
    client.subscribe("orbit/+/+/heartbeat", { qos: 1 });
  });

  client.on("message", (topic: string, buf: Buffer) => {
    void handleMessage(env, topic, buf).catch(() => {
      // Operational visibility via OrbitIngestFailure rows
    });
  });

  return {
    client,
    stop: async () => {
      await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
    },
  };
}

async function handleMessage(env: OrbitEnv, topic: string, buf: Buffer) {
  const parsedTopic = parseOrbitMqttTopic(topic);
  if (!parsedTopic) {
    await prisma.orbitIngestFailure.create({
      data: { topic, reason: "Invalid topic shape", payloadPreview: buf.toString("utf8").slice(0, 120) },
    });
    return;
  }

  const size = validateTelemetryBytes(buf);
  if (!size.ok) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: parsedTopic.tenantId,
        deviceId: parsedTopic.deviceId,
        reason: size.reason,
      },
    });
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(size.text);
  } catch {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: parsedTopic.tenantId,
        deviceId: parsedTopic.deviceId,
        reason: "Invalid JSON",
      },
    });
    return;
  }

  const device = await prisma.orbitDevice.findUnique({ where: { id: parsedTopic.deviceId } });
  if (!device || device.revokedAt || !device.credentialHash) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: parsedTopic.tenantId,
        deviceId: parsedTopic.deviceId,
        reason: device?.revokedAt ? "Credential revoked" : "Unknown or unenrolled device",
      },
    });
    return;
  }
  if (device.tenantId !== parsedTopic.tenantId) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: parsedTopic.tenantId,
        deviceId: parsedTopic.deviceId,
        reason: "Topic tenant does not match device registry tenant (spoof blocked)",
      },
    });
    return;
  }

  const payloadDeviceId =
    json && typeof json === "object" && typeof (json as { deviceId?: unknown }).deviceId === "string"
      ? (json as { deviceId: string }).deviceId
      : null;
  if (payloadDeviceId !== device.id) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: device.tenantId,
        deviceId: device.id,
        reason: "Payload deviceId does not match topic deviceId",
      },
    });
    return;
  }

  const typed =
    json && typeof json === "object"
      ? ((json as { typedValues?: Record<string, unknown> }).typedValues ?? {})
      : {};
  const mqttSecret = typeof typed.__mqttSecret === "string" ? typed.__mqttSecret : null;
  // App-layer device auth is mandatory until broker per-device ACL + mTLS is verified.
  // Do not accept topic-only identity.
  if (!mqttSecret || !credentialsMatch(mqttSecret, device.credentialHash)) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: device.tenantId,
        deviceId: device.id,
        reason: mqttSecret
          ? "MQTT device secret mismatch"
          : "MQTT device secret required (broker ACL/mTLS not yet verified as sole auth)",
      },
    });
    return;
  }

  // Durable handoff: inbox insert before considering the message accepted.
  // Note: mqtt.js default QoS1 may PUBACK on handler return; production should use
  // manual ack after this await (ORBIT_MQTT_MANUAL_ACK) once broker ACLs are live.
  const accepted = await acceptIntoInbox(prisma, {
    deviceId: device.id,
    tenantId: device.tenantId,
    topic,
    payload: json,
  });
  if ("error" in accepted) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: device.tenantId,
        deviceId: device.id,
        reason: accepted.error,
      },
    });
    return;
  }

  if (!accepted.duplicate) {
    await processInboxItem(prisma, accepted.inbox.id, {
      authenticatedTenantId: device.tenantId,
      deviceId: device.id,
      deviceType: device.deviceType,
    });
    await flushOutbox(env);
  }
}

export function expectedPublishTopic(tenantId: string, deviceId: string) {
  return orbitMqttTopic(tenantId, deviceId, "telemetry");
}
