/**
 * Orbit MQTT contracts for Orbit Edge / partner firmware.
 *
 * Transport is MQTT; auth and payload semantics match HTTPS ingest:
 * - enroll still happens over HTTPS (claim code → deviceSecret)
 * - devices publish with username=orbitDeviceId, password=deviceSecret
 * - Orbit Cloud subscribes and writes the same telemetry/state tables
 *
 * Topic layout (ACL: device may publish only under its own prefix):
 *   orbit/{tenantId}/{deviceId}/heartbeat
 *   orbit/{tenantId}/{deviceId}/telemetry
 *   orbit/{tenantId}/{deviceId}/cmd   (reserved — Orbit → device, future)
 */

import { ORBIT_TENANT_ID } from "./orbit.js";

export const ORBIT_MQTT_TOPIC_PREFIX = "orbit" as const;

export const OrbitMqttChannel = {
  HEARTBEAT: "heartbeat",
  TELEMETRY: "telemetry",
  CMD: "cmd",
} as const;
export type OrbitMqttChannel = (typeof OrbitMqttChannel)[keyof typeof OrbitMqttChannel];

export type OrbitMqttTopicParts = {
  tenantId: string;
  deviceId: string;
  channel: OrbitMqttChannel;
};

/** Build a device publish/subscribe topic. */
export function orbitMqttTopic(input: {
  tenantId?: string;
  deviceId: string;
  channel: OrbitMqttChannel;
}): string {
  const tenantId = input.tenantId ?? ORBIT_TENANT_ID;
  return `${ORBIT_MQTT_TOPIC_PREFIX}/${tenantId}/${input.deviceId}/${input.channel}`;
}

/** Wildcard for Orbit Cloud service subscriber. */
export function orbitMqttServiceSubscribeFilter(tenantId = ORBIT_TENANT_ID): string {
  return `${ORBIT_MQTT_TOPIC_PREFIX}/${tenantId}/+/+`;
}

/**
 * Parse `orbit/{tenant}/{deviceId}/{channel}`.
 * Returns null if the topic is not an Orbit ingest topic we handle.
 */
export function parseOrbitMqttTopic(topic: string): OrbitMqttTopicParts | null {
  const parts = topic.split("/").filter(Boolean);
  if (parts.length !== 4) return null;
  if (parts[0] !== ORBIT_MQTT_TOPIC_PREFIX) return null;
  const tenantId = parts[1]!;
  const deviceId = parts[2]!;
  const channel = parts[3]!;
  if (
    channel !== OrbitMqttChannel.HEARTBEAT &&
    channel !== OrbitMqttChannel.TELEMETRY &&
    channel !== OrbitMqttChannel.CMD
  ) {
    return null;
  }
  if (!tenantId || !deviceId) return null;
  return { tenantId, deviceId, channel };
}

/** Partner-facing topic map after enroll. */
export function orbitMqttDeviceTopics(input: {
  tenantId?: string;
  deviceId: string;
}): {
  heartbeat: string;
  telemetry: string;
  cmd: string;
  subscribeFilterHint: string;
} {
  const tenantId = input.tenantId ?? ORBIT_TENANT_ID;
  return {
    heartbeat: orbitMqttTopic({ tenantId, deviceId: input.deviceId, channel: OrbitMqttChannel.HEARTBEAT }),
    telemetry: orbitMqttTopic({ tenantId, deviceId: input.deviceId, channel: OrbitMqttChannel.TELEMETRY }),
    cmd: orbitMqttTopic({ tenantId, deviceId: input.deviceId, channel: OrbitMqttChannel.CMD }),
    subscribeFilterHint: orbitMqttTopic({
      tenantId,
      deviceId: input.deviceId,
      channel: OrbitMqttChannel.CMD,
    }),
  };
}

export type OrbitMqttHeartbeatPayload = {
  at?: string;
};

export type OrbitMqttTelemetrySample = {
  kind: string;
  observedAt?: string;
  payload?: Record<string, unknown>;
};

export type OrbitMqttTelemetryPayload = {
  samples: OrbitMqttTelemetrySample[];
};

/** Broker ACL cheat-sheet for partners (Mosquitto / EMQX / HiveMQ). */
export function orbitMqttAclHints(input: {
  tenantId?: string;
  deviceId: string;
}): {
  username: string;
  password: string;
  publishAllow: string[];
  subscribeAllow: string[];
  denyHint: string;
} {
  const tenantId = input.tenantId ?? ORBIT_TENANT_ID;
  const prefix = `${ORBIT_MQTT_TOPIC_PREFIX}/${tenantId}/${input.deviceId}`;
  return {
    username: input.deviceId,
    password: "<deviceSecret from HTTPS enroll — shown once>",
    publishAllow: [`${prefix}/heartbeat`, `${prefix}/telemetry`],
    subscribeAllow: [`${prefix}/cmd`],
    denyHint: "Device must not publish or subscribe under any other deviceId prefix.",
  };
}
