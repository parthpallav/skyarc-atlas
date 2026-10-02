/**
 * Authenticated MQTT consumer for Lunar Spec v1.0 topics.
 * skyarc/v1/orbit/{physicalDeviceId}/{channel}
 *
 * Directional ACL (app-layer): devices publish telemetry|heartbeat|status|events|command-ack only.
 * Tenant identity derived from device registry. messageId deduped per device.
 *
 * Durable handoff: persist OrbitIngestInbox before considering the message accepted.
 * Broker QoS PUBACK ≠ normalized DB persistence.
 *
 * Live broker verification requires ORBIT_MQTT_URL + per-device broker ACLs.
 * Without them, HTTPS Lunar ingest + simulator cover the same contracts.
 */
import {
  parseOrbitLunarMqttTopic,
  lunarDeviceMayPublish,
  orbitLunarMqttTopic,
  ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS,
} from "@skyarc/shared";
import type { OrbitEnv } from "../env.js";
import { prisma } from "../prisma.js";
import { credentialsMatch } from "../crypto.js";
import {
  acceptLunarEnvelope,
  validateLunarMessageBytes,
} from "../lib/ingest.js";
import { scrubLunarSecrets } from "../lib/lunar-envelope.js";
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

  // mqtt is an optionalDependency — may be absent in typecheck environments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mqtt: any;
  try {
    // @ts-expect-error optional dependency; types may be absent when not installed
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
    for (const channel of ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS) {
      client.subscribe(`skyarc/v1/orbit/+/${channel}`, { qos: 1 });
    }
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
  const parsedTopic = parseOrbitLunarMqttTopic(topic);
  if (!parsedTopic) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        reason: "Invalid Lunar topic shape (expected skyarc/v1/orbit/{deviceId}/{channel})",
        payloadPreview: buf.toString("utf8").slice(0, 120),
      },
    });
    return;
  }

  const { physicalDeviceId, channel } = parsedTopic;

  // Devices must not publish on commands/config
  if (!lunarDeviceMayPublish(physicalDeviceId, physicalDeviceId, channel)) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        reason: `Directional ACL: devices cannot publish on channel ${channel}`,
      },
    });
    return;
  }

  const size = validateLunarMessageBytes(buf);
  if (!size.ok) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        deviceId: undefined,
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
      data: { topic, reason: "Invalid JSON" },
    });
    return;
  }

  const device = await prisma.orbitDevice.findUnique({
    where: { physicalDeviceId },
  });
  if (!device || device.revokedAt || !device.credentialHash) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        reason: device?.revokedAt
          ? "Credential revoked — active access terminated at app layer; broker session kill required in production ACL"
          : "Unknown or unenrolled physical device",
      },
    });
    return;
  }

  const envelopeDeviceId =
    json && typeof json === "object" && typeof (json as { deviceId?: unknown }).deviceId === "string"
      ? (json as { deviceId: string }).deviceId
      : null;
  if (envelopeDeviceId !== physicalDeviceId || envelopeDeviceId !== device.physicalDeviceId) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: device.tenantId,
        deviceId: device.id,
        reason: "Envelope/topic physical deviceId mismatch (spoof blocked)",
      },
    });
    return;
  }

  // App-layer device auth until broker per-device ACL + mTLS verified as sole auth.
  const secret =
    json && typeof json === "object"
      ? extractMqttSecret(json as Record<string, unknown>)
      : null;
  if (!secret || !credentialsMatch(secret, device.credentialHash)) {
    await prisma.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: device.tenantId,
        deviceId: device.id,
        reason: secret
          ? "MQTT device secret mismatch"
          : "MQTT device secret required (broker ACL/mTLS not yet verified as sole auth)",
      },
    });
    return;
  }

  const scrubbed = scrubLunarSecrets(json);
  await acceptLunarEnvelope(prisma, {
    deviceId: device.id,
    tenantId: device.tenantId,
    physicalDeviceId,
    deviceType: device.deviceType,
    topic,
    channel,
    envelope: scrubbed,
    maxSkewMs: env.ORBIT_MAX_CLOCK_SKEW_MS,
    staleAfterMs: env.ORBIT_STALE_OBSERVATION_MS,
  });
  await flushOutbox(env);
}

function extractMqttSecret(json: Record<string, unknown>): string | null {
  if (typeof json.__mqttSecret === "string") return json.__mqttSecret;
  const payload = json.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    if (typeof p.__mqttSecret === "string") return p.__mqttSecret;
  }
  return null;
}

export function expectedPublishTopic(physicalDeviceId: string) {
  return orbitLunarMqttTopic(physicalDeviceId, "telemetry");
}
