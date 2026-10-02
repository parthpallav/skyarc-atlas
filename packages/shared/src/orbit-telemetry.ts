/**
 * Orbit telemetry contracts (versioned).
 * Distinguishes Edge connectivity/diagnostics, Edge Sense traffic observations,
 * and CMS/player playback evidence. Unsupported measurements stay unknown.
 * Do not invent measurements. Raw camera images are not enabled by default.
 *
 * Wire baseline for Lunar firmware is MQTT Spec v1.0 (`orbit-mqtt-lunar.ts`).
 * `7b.v1` is the internal/normalized HTTPS + processing schema — not a firmware rename.
 */

export * from "./orbit-mqtt-lunar.js";

export const ORBIT_PAYLOAD_VERSION = "7b.v1" as const;

export const OrbitMeasurementType = {
  HEARTBEAT: "heartbeat",
  CONNECTIVITY: "connectivity",
  GPS: "gps",
  POWER: "power",
  DIAGNOSTIC: "diagnostic",
  SENSOR_HEALTH: "sensor_health",
  /** Edge Sense — separately validated; not inferred from heartbeat. */
  TRAFFIC_COUNT: "traffic_count",
  AUDIENCE_OBS: "audience_obs",
  /** CMS/player — trusted playback requires creative/campaign ids from supported integration. */
  PLAYBACK: "playback",
  SCREEN_POWER: "screen_power",
} as const;
export type OrbitMeasurementType =
  (typeof OrbitMeasurementType)[keyof typeof OrbitMeasurementType];

export const OrbitDeviceCapabilityProfile = {
  ORBIT_EDGE: {
    deviceType: "orbit_edge",
    supported: [
      OrbitMeasurementType.HEARTBEAT,
      OrbitMeasurementType.CONNECTIVITY,
      OrbitMeasurementType.GPS,
      OrbitMeasurementType.POWER,
      OrbitMeasurementType.DIAGNOSTIC,
      OrbitMeasurementType.SENSOR_HEALTH,
      OrbitMeasurementType.SCREEN_POWER,
    ] as const,
    unsupportedByDefault: [
      OrbitMeasurementType.TRAFFIC_COUNT,
      OrbitMeasurementType.AUDIENCE_OBS,
      OrbitMeasurementType.PLAYBACK,
    ] as const,
  },
  ORBIT_EDGE_SENSE: {
    deviceType: "orbit_edge_sense",
    supported: [
      OrbitMeasurementType.HEARTBEAT,
      OrbitMeasurementType.CONNECTIVITY,
      OrbitMeasurementType.GPS,
      OrbitMeasurementType.POWER,
      OrbitMeasurementType.DIAGNOSTIC,
      OrbitMeasurementType.SENSOR_HEALTH,
      OrbitMeasurementType.TRAFFIC_COUNT,
      OrbitMeasurementType.AUDIENCE_OBS,
    ] as const,
    unsupportedByDefault: [OrbitMeasurementType.PLAYBACK] as const,
  },
  MEDIA_PLAYER: {
    deviceType: "media_player",
    supported: [
      OrbitMeasurementType.HEARTBEAT,
      OrbitMeasurementType.CONNECTIVITY,
      OrbitMeasurementType.PLAYBACK,
    ] as const,
    unsupportedByDefault: [
      OrbitMeasurementType.TRAFFIC_COUNT,
      OrbitMeasurementType.AUDIENCE_OBS,
      OrbitMeasurementType.GPS,
    ] as const,
  },
} as const;

export type OrbitCapabilityStatus = "supported" | "unsupported" | "unknown" | "unavailable";

/**
 * @deprecated Legacy internal topic shape. Lunar Spec v1.0 uses
 * `skyarc/v1/orbit/{physicalDeviceId}/{channel}` via `orbitLunarMqttTopic`.
 */
export function orbitMqttTopic(tenantId: string, deviceId: string, channel: "telemetry" | "heartbeat" | "ack") {
  return `orbit/${tenantId}/${deviceId}/${channel}`;
}

/** @deprecated Prefer `parseOrbitLunarMqttTopic`. */
export function parseOrbitMqttTopic(topic: string): {
  tenantId: string;
  deviceId: string;
  channel: string;
} | null {
  const parts = topic.split("/");
  if (parts.length !== 4 || parts[0] !== "orbit") return null;
  return { tenantId: parts[1], deviceId: parts[2], channel: parts[3] };
}

export type OrbitTelemetryPayloadV1 = {
  schemaVersion: typeof ORBIT_PAYLOAD_VERSION;
  eventId: string;
  deviceId: string;
  bootId: string;
  sessionId: string;
  sequence: number;
  observedAt: string;
  firmwareVersion: string;
  measurementType: OrbitMeasurementType | string;
  value: number | string | boolean | null;
  unit?: string | null;
  typedValues?: Record<string, number | string | boolean | null>;
  sensorModelVersion?: string | null;
  confidence?: number | null;
  qualityFlags?: string[];
  /** Playback only — required for trusted campaign attribution. */
  creativeId?: string | null;
  campaignId?: string | null;
  /** Never include raw camera frames by default. */
  includesImage?: false;
};

export type OrbitIngestServerMeta = {
  receivedAt: string;
  authenticatedTenantId: string;
  ingestResult: "accepted" | "duplicate" | "rejected" | "deferred";
  rejectReason?: string;
};

/**
 * Heartbeat proves connectivity only — never screen power or campaign playback.
 */
export function connectivityFromHeartbeat(input: {
  observedAt: Date;
  receivedAt: Date;
  maxSkewMs: number;
  staleAfterMs: number;
}): {
  connectivity: "online" | "stale" | "future_skew";
  markOnlineNow: boolean;
  reason: string;
} {
  const skew = input.observedAt.getTime() - input.receivedAt.getTime();
  if (skew > input.maxSkewMs) {
    return {
      connectivity: "future_skew",
      markOnlineNow: false,
      reason: "Observation ahead of server clock beyond drift allowance",
    };
  }
  const age = input.receivedAt.getTime() - input.observedAt.getTime();
  if (age > input.staleAfterMs) {
    return {
      connectivity: "stale",
      markOnlineNow: false,
      reason: "Historical/stale heartbeat — must not mark device online now",
    };
  }
  return {
    connectivity: "online",
    markOnlineNow: true,
    reason: "Fresh heartbeat within skew/age windows",
  };
}

export function capabilityStatus(
  deviceType: string,
  measurementType: string
): OrbitCapabilityStatus {
  const profiles = Object.values(OrbitDeviceCapabilityProfile);
  const profile = profiles.find((p) => p.deviceType === deviceType);
  if (!profile) return "unknown";
  if ((profile.supported as readonly string[]).includes(measurementType)) return "supported";
  if ((profile.unsupportedByDefault as readonly string[]).includes(measurementType)) {
    return "unsupported";
  }
  return "unknown";
}
