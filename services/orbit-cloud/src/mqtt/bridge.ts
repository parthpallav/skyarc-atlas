import mqtt, { type MqttClient } from "mqtt";
import { z } from "zod";
import {
  OrbitMqttChannel,
  ORBIT_TENANT_ID,
  orbitMqttServiceSubscribeFilter,
  parseOrbitMqttTopic,
} from "@skyarc/shared";
import type { OrbitEnv } from "../env.js";
import {
  assertDeviceIngestable,
  ingestHeartbeat,
  ingestTelemetry,
} from "../ingest.js";

const heartbeatPayloadSchema = z
  .object({
    at: z.string().datetime().optional(),
  })
  .passthrough()
  .default({});

const telemetryPayloadSchema = z.object({
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
});

export type OrbitMqttBridge = {
  client: MqttClient;
  stop: () => Promise<void>;
};

/**
 * Orbit Cloud MQTT subscriber.
 *
 * Devices publish to a broker you host (HiveMQ Cloud, EMQX, Mosquitto, etc.).
 * This process connects with service credentials and ingests the same way as HTTPS.
 *
 * Device auth on the broker (recommended ACL):
 *   username = orbitDeviceId
 *   password = deviceSecret (from HTTPS enroll)
 *   publish: orbit/{tenant}/{deviceId}/heartbeat|telemetry
 *   subscribe: orbit/{tenant}/{deviceId}/cmd  (future)
 */
export async function startOrbitMqttBridge(
  env: OrbitEnv,
  log: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void }
): Promise<OrbitMqttBridge | null> {
  if (!env.ORBIT_MQTT_ENABLED) {
    log.info({}, "MQTT bridge disabled (ORBIT_MQTT_ENABLED=false)");
    return null;
  }
  if (!env.ORBIT_MQTT_URL) {
    log.warn({}, "ORBIT_MQTT_ENABLED but ORBIT_MQTT_URL missing — bridge not started");
    return null;
  }

  const filter = orbitMqttServiceSubscribeFilter(env.ORBIT_MQTT_TENANT_ID);
  const client = mqtt.connect(env.ORBIT_MQTT_URL, {
    username: env.ORBIT_MQTT_USERNAME || undefined,
    password: env.ORBIT_MQTT_PASSWORD || undefined,
    clientId: env.ORBIT_MQTT_CLIENT_ID,
    clean: true,
    reconnectPeriod: 5_000,
    protocolVersion: 4,
  });

  const handleMessage = async (topic: string, buf: Buffer) => {
    const parsedTopic = parseOrbitMqttTopic(topic);
    if (!parsedTopic) return;
    if (parsedTopic.channel === OrbitMqttChannel.CMD) return; // reserved
    if (parsedTopic.tenantId !== env.ORBIT_MQTT_TENANT_ID) {
      log.warn({ topic }, "MQTT tenant mismatch — ignored");
      return;
    }

    let device;
    try {
      device = await assertDeviceIngestable(parsedTopic.deviceId);
    } catch (err) {
      log.warn({ topic, err }, "MQTT ingest rejected — device not ingestible");
      return;
    }
    if (device.tenantId !== parsedTopic.tenantId) {
      log.warn({ topic }, "MQTT device tenant mismatch — ignored");
      return;
    }

    let json: unknown = {};
    const raw = buf.toString("utf8").trim();
    if (raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        log.warn({ topic }, "MQTT payload is not JSON — ignored");
        return;
      }
    }

    try {
      if (parsedTopic.channel === OrbitMqttChannel.HEARTBEAT) {
        const body = heartbeatPayloadSchema.parse(json ?? {});
        const at = body.at ? new Date(body.at) : new Date();
        await ingestHeartbeat(env, device.id, at);
        return;
      }
      if (parsedTopic.channel === OrbitMqttChannel.TELEMETRY) {
        const body = telemetryPayloadSchema.parse(json);
        await ingestTelemetry(env, device.id, body.samples);
      }
    } catch (err) {
      log.error({ topic, err }, "MQTT ingest failed");
    }
  };

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      client.off("connect", onConnect);
      reject(err);
    };
    const onConnect = () => {
      client.off("error", onError);
      resolve();
    };
    client.once("error", onError);
    client.once("connect", onConnect);
  });

  await new Promise<void>((resolve, reject) => {
    client.subscribe(filter, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  client.on("message", (topic, payload) => {
    void handleMessage(topic, payload);
  });
  client.on("reconnect", () => log.info({ filter }, "MQTT reconnecting"));
  client.on("error", (err) => log.error({ err }, "MQTT client error"));

  log.info(
    {
      url: env.ORBIT_MQTT_URL,
      filter,
      tenantId: env.ORBIT_MQTT_TENANT_ID ?? ORBIT_TENANT_ID,
      clientId: env.ORBIT_MQTT_CLIENT_ID,
    },
    "MQTT bridge subscribed"
  );

  return {
    client,
    stop: async () => {
      await new Promise<void>((resolve) => {
        client.end(false, {}, () => resolve());
      });
    },
  };
}
