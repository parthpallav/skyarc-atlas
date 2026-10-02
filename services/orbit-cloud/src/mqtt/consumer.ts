/**
 * Authenticated MQTT consumer for Lunar Spec v1.0 topics.
 * skyarc/v1/orbit/{physicalDeviceId}/{channel}
 *
 * Ingestion boundary (MQTT):
 * - Trusted identity is the **topic physicalDeviceId** after delivery through a broker
 *   with authentication + directional ACLs (device may only publish its own uplink topics).
 * - Envelope deviceId must match the topic — never trust publisher-supplied identity alone.
 * - Payload `__mqttSecret` is NOT used for auth and is scrubbed if present.
 * - HTTPS ingest continues to use `x-orbit-device-id` + `x-orbit-device-secret` headers.
 *
 * Live broker verification requires ORBIT_MQTT_URL + per-device broker ACLs + TLS in production.
 */
import {
  parseOrbitLunarMqttTopic,
  lunarDeviceMayPublish,
  orbitLunarMqttTopic,
  ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS,
} from "@skyarc/shared";
import type { OrbitEnv } from "../env.js";
import { prisma } from "../prisma.js";
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

  // mqtt is an optionalDependency — may be absent in some install modes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mqtt: any;
  try {
    mqtt = await import("mqtt");
  } catch {
    return null;
  }

  const useTls = env.ORBIT_MQTT_URL.startsWith("mqtts");
  const client = mqtt.default.connect(env.ORBIT_MQTT_URL, {
    // Always set protocol — some brokers/URLs otherwise throw "Missing protocol".
    protocol: useTls ? "mqtts" : "mqtt",
    protocolVersion: 5,
    rejectUnauthorized: env.NODE_ENV === "production",
    username: env.ORBIT_MQTT_USERNAME,
    password: env.ORBIT_MQTT_PASSWORD,
    reconnectPeriod: 5_000,
    clientId: `orbit-cloud-ingest-${process.pid}`,
    properties: {
      sessionExpiryInterval: 3600,
    },
  });

  client.on("connect", () => {
    for (const channel of ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS) {
      client.subscribe(`skyarc/v1/orbit/+/${channel}`, { qos: 1 });
    }
  });

  client.on("message", (topic: string, buf: Buffer) => {
    void handleInboundMqttMessage(env, topic, buf).catch(() => {
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

/**
 * MQTT ingest path — broker ACL is the authentication boundary.
 * Exported for broker integration tests.
 */
export async function handleInboundMqttMessage(
  env: OrbitEnv,
  topic: string,
  buf: Buffer,
  db: typeof prisma = prisma
) {
  const parsedTopic = parseOrbitLunarMqttTopic(topic);
  if (!parsedTopic) {
    await db.orbitIngestFailure.create({
      data: {
        topic,
        reason: "Invalid Lunar topic shape (expected skyarc/v1/orbit/{deviceId}/{channel})",
        payloadPreview: scrubPreview(buf),
      },
    });
    return { rejected: true as const, reason: "bad_topic" as const };
  }

  const { physicalDeviceId, channel } = parsedTopic;

  // Devices must not publish on commands/config (defense in depth beyond broker ACL)
  if (!lunarDeviceMayPublish(physicalDeviceId, physicalDeviceId, channel)) {
    await db.orbitIngestFailure.create({
      data: {
        topic,
        reason: `Directional ACL: devices cannot publish on channel ${channel}`,
      },
    });
    return { rejected: true as const, reason: "acl_deny" as const };
  }

  const size = validateLunarMessageBytes(buf);
  if (!size.ok) {
    await db.orbitIngestFailure.create({
      data: {
        topic,
        reason: size.reason,
        payloadPreview: scrubPreview(buf),
      },
    });
    return { rejected: true as const, reason: "size" as const };
  }

  let json: unknown;
  try {
    json = JSON.parse(size.text);
  } catch {
    await db.orbitIngestFailure.create({
      data: { topic, reason: "Invalid JSON", payloadPreview: scrubPreview(buf) },
    });
    return { rejected: true as const, reason: "json" as const };
  }

  // Reject credential material in payloads — never accept or persist secrets from publishers
  if (payloadContainsSecretMaterial(json)) {
    await db.orbitIngestFailure.create({
      data: {
        topic,
        reason: "Payload must not contain device credentials (__mqttSecret/deviceSecret) — use broker auth",
        payloadPreview: scrubPreview(buf),
      },
    });
    return { rejected: true as const, reason: "secret_in_payload" as const };
  }

  // Trusted identity = topic physicalDeviceId (broker ACL enforced). Registry lookup.
  const device = await db.orbitDevice.findUnique({
    where: { physicalDeviceId },
  });
  if (!device || device.revokedAt) {
    await db.orbitIngestFailure.create({
      data: {
        topic,
        reason: device?.revokedAt
          ? "Credential revoked — broker session kill required in production ACL"
          : "Unknown or unenrolled physical device for topic identity",
      },
    });
    return { rejected: true as const, reason: "unknown_device" as const };
  }

  const envelopeDeviceId =
    json && typeof json === "object" && typeof (json as { deviceId?: unknown }).deviceId === "string"
      ? (json as { deviceId: string }).deviceId
      : null;
  // Do not trust publisher metadata alone — must equal topic identity and registry
  if (envelopeDeviceId !== physicalDeviceId || envelopeDeviceId !== device.physicalDeviceId) {
    await db.orbitIngestFailure.create({
      data: {
        topic,
        tenantId: device.tenantId,
        deviceId: device.id,
        reason: "Envelope/topic physical deviceId mismatch (spoof blocked)",
      },
    });
    return { rejected: true as const, reason: "device_mismatch" as const };
  }

  const scrubbed = scrubLunarSecrets(json);
  const result = await acceptLunarEnvelope(db, {
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
  return result;
}

function payloadContainsSecretMaterial(json: unknown): boolean {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const obj = json as Record<string, unknown>;
  if (typeof obj.__mqttSecret === "string" || typeof obj.deviceSecret === "string") return true;
  const payload = obj.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const p = payload as Record<string, unknown>;
    if (typeof p.__mqttSecret === "string" || typeof p.deviceSecret === "string") return true;
  }
  const typed = obj.typedValues;
  if (typed && typeof typed === "object" && !Array.isArray(typed)) {
    const t = typed as Record<string, unknown>;
    if (typeof t.__mqttSecret === "string" || typeof t.deviceSecret === "string") return true;
  }
  return false;
}

/** Never write secrets into failure previews / dead-letter. */
function scrubPreview(buf: Buffer): string {
  let text = buf.toString("utf8").slice(0, 200);
  text = text.replace(/"__mqttSecret"\s*:\s*"[^"]*"/gi, '"__mqttSecret":"[redacted]"');
  text = text.replace(/"deviceSecret"\s*:\s*"[^"]*"/gi, '"deviceSecret":"[redacted]"');
  return text;
}

export function expectedPublishTopic(physicalDeviceId: string) {
  return orbitLunarMqttTopic(physicalDeviceId, "telemetry");
}
