/**
 * Skyarc Orbit MQTT Spec v1.0 (Lunar Embedded) — wire contract helpers.
 *
 * This is the partner-facing topic/envelope baseline. Do not silently rename
 * firmware fields. Proposed backend additions live in the compatibility matrix
 * and must not be treated as agreed until Lunar confirms in writing.
 *
 * Internal Atlas/Orbit processing may normalize into 7b.v1; firmware keeps
 * messageId / timestamp / type / version / payload as documented.
 */

export const ORBIT_MQTT_LUNAR_VERSION = "1.0" as const;
export const ORBIT_MQTT_TOPIC_PREFIX = "skyarc/v1/orbit" as const;

/** Device → broker (publish). Atlas/Orbit Cloud consumers subscribe. */
export const ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS = [
  "telemetry",
  "heartbeat",
  "status",
  "events",
  "command-ack",
] as const;

/** Broker → device (device subscribes). Atlas/Orbit Cloud publish. */
export const ORBIT_MQTT_DEVICE_SUBSCRIBE_CHANNELS = ["commands", "config"] as const;

export type OrbitMqttDevicePublishChannel =
  (typeof ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS)[number];
export type OrbitMqttDeviceSubscribeChannel =
  (typeof ORBIT_MQTT_DEVICE_SUBSCRIBE_CHANNELS)[number];
export type OrbitMqttChannel =
  | OrbitMqttDevicePublishChannel
  | OrbitMqttDeviceSubscribeChannel;

export const OrbitLunarMessageType = {
  TELEMETRY: "telemetry",
  HEARTBEAT: "heartbeat",
  STATUS: "status",
  EVENT: "event",
  COMMAND: "command",
  COMMAND_ACK: "command-ack",
  CONFIG: "config",
} as const;
export type OrbitLunarMessageType =
  (typeof OrbitLunarMessageType)[keyof typeof OrbitLunarMessageType];

export const OrbitLunarStatus = {
  BOOTING: "BOOTING",
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  DEGRADED: "DEGRADED",
  ERROR: "ERROR",
  UPDATING: "UPDATING",
  MAINTENANCE: "MAINTENANCE",
} as const;

export const OrbitLunarCommandName = {
  CAPTURE_STATUS: "capture_status",
  REQUEST_DIAGNOSTICS: "request_diagnostics",
  SYNC_CONFIG: "sync_config",
  RESTART: "restart",
} as const;
export type OrbitLunarCommandName =
  (typeof OrbitLunarCommandName)[keyof typeof OrbitLunarCommandName];

/** MVP only — camera/OTA/player control are future, not established. */
export const ORBIT_LUNAR_MVP_COMMANDS = [
  OrbitLunarCommandName.CAPTURE_STATUS,
  OrbitLunarCommandName.REQUEST_DIAGNOSTICS,
  OrbitLunarCommandName.SYNC_CONFIG,
  OrbitLunarCommandName.RESTART,
] as const;

export const OrbitLunarAckStatus = {
  RECEIVED: "RECEIVED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXECUTING: "EXECUTING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type OrbitLunarAckStatus =
  (typeof OrbitLunarAckStatus)[keyof typeof OrbitLunarAckStatus];

/** Spec default until Section 10 decides otherwise. */
export const ORBIT_LUNAR_MAX_MESSAGE_BYTES = 65_536;
export const ORBIT_LUNAR_HEARTBEAT_INTERVAL_S = 60;
export const ORBIT_LUNAR_MISSED_HEARTBEAT_THRESHOLD = 3;

export type OrbitLunarEnvelope = {
  messageId: string;
  deviceId: string;
  timestamp: string;
  type: OrbitLunarMessageType | string;
  version: string;
  payload: Record<string, unknown>;
};

export function orbitLunarMqttTopic(physicalDeviceId: string, channel: OrbitMqttChannel): string {
  return `${ORBIT_MQTT_TOPIC_PREFIX}/${physicalDeviceId}/${channel}`;
}

export function parseOrbitLunarMqttTopic(topic: string): {
  physicalDeviceId: string;
  channel: OrbitMqttChannel;
} | null {
  const parts = topic.split("/");
  // skyarc / v1 / orbit / {deviceId} / {channel}
  if (parts.length !== 5) return null;
  if (parts[0] !== "skyarc" || parts[1] !== "v1" || parts[2] !== "orbit") return null;
  const channel = parts[4];
  const all = [
    ...ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS,
    ...ORBIT_MQTT_DEVICE_SUBSCRIBE_CHANNELS,
  ] as readonly string[];
  if (!all.includes(channel)) return null;
  return {
    physicalDeviceId: parts[3],
    channel: channel as OrbitMqttChannel,
  };
}

/** Directional ACL: devices may only publish on device-publish channels for their own id. */
export function lunarDeviceMayPublish(
  authenticatedPhysicalId: string,
  topicPhysicalId: string,
  channel: string
): boolean {
  if (authenticatedPhysicalId !== topicPhysicalId) return false;
  return (ORBIT_MQTT_DEVICE_PUBLISH_CHANNELS as readonly string[]).includes(channel);
}

export function lunarDeviceMaySubscribe(
  authenticatedPhysicalId: string,
  topicPhysicalId: string,
  channel: string
): boolean {
  if (authenticatedPhysicalId !== topicPhysicalId) return false;
  return (ORBIT_MQTT_DEVICE_SUBSCRIBE_CHANNELS as readonly string[]).includes(channel);
}

/** MQTT client id form from the Lunar draft: skyarc-orbit-ORBIT-0001 */
export function lunarMqttClientId(physicalDeviceId: string): string {
  return `skyarc-orbit-${physicalDeviceId}`;
}

/** Username proposal from the draft: orbit_ORBIT0001 (hyphens stripped). */
export function lunarMqttUsername(physicalDeviceId: string): string {
  return `orbit_${physicalDeviceId.replace(/-/g, "")}`;
}

/**
 * Proposed additions — NOT agreed with Lunar. Backend may store when present;
 * firmware is not required to send them.
 */
export const ORBIT_LUNAR_PROPOSED_ADDITIONS = [
  "bootId",
  "sequence",
  "clockQuality",
  "exact measurement units / sensor meaning",
  "bounded offline telemetry summaries (baseline queues events+acks only)",
  "command expiry / execution deadlines",
  "session expiry, queue limits, acknowledgment timeouts",
  "configuration sync completion semantics beyond CONFIG_UPDATED",
] as const;
