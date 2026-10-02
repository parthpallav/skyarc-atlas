/**
 * Contract simulator — Lunar Spec v1.0 envelope + topics.
 * Also builds internal 7b.v1 for HTTPS path compatibility.
 * Does not require physical hardware or a live broker.
 */
import { randomUUID } from "node:crypto";
import {
  ORBIT_PAYLOAD_VERSION,
  OrbitMeasurementType,
  OrbitLunarMessageType,
  orbitLunarMqttTopic,
  type OrbitTelemetryPayloadV1,
  type OrbitLunarEnvelope,
} from "@skyarc/shared";

export function buildSimulatedTelemetry(input: {
  deviceId: string;
  measurementType?: string;
  sequence?: number;
  observedAt?: Date;
  bootId?: string;
  sessionId?: string;
  value?: number | string | boolean | null;
  creativeId?: string | null;
  campaignId?: string | null;
  mqttSecret?: string;
}): OrbitTelemetryPayloadV1 {
  const observedAt = (input.observedAt ?? new Date()).toISOString();
  const typedValues: Record<string, number | string | boolean | null> = {};
  if (input.mqttSecret) typedValues.__mqttSecret = input.mqttSecret;

  return {
    schemaVersion: ORBIT_PAYLOAD_VERSION,
    eventId: randomUUID(),
    deviceId: input.deviceId,
    bootId: input.bootId ?? `boot-${randomUUID().slice(0, 8)}`,
    sessionId: input.sessionId ?? `sess-${randomUUID().slice(0, 8)}`,
    sequence: input.sequence ?? 1,
    observedAt,
    firmwareVersion: "sim-7b.0",
    measurementType: input.measurementType ?? OrbitMeasurementType.HEARTBEAT,
    value: input.value ?? 1,
    unit: null,
    typedValues,
    sensorModelVersion: "sim-v1",
    confidence: 1,
    qualityFlags: ["simulated"],
    creativeId: input.creativeId ?? null,
    campaignId: input.campaignId ?? null,
    includesImage: false,
  };
}

export function buildOfflineReplayBatch(
  deviceId: string,
  count: number,
  start: Date,
  intervalMs = 60_000
): OrbitTelemetryPayloadV1[] {
  const bootId = `boot-replay-${randomUUID().slice(0, 8)}`;
  const sessionId = `sess-replay-${randomUUID().slice(0, 8)}`;
  const out: OrbitTelemetryPayloadV1[] = [];
  for (let i = 0; i < count; i++) {
    const observedAt = new Date(start.getTime() + i * intervalMs);
    out.push(
      buildSimulatedTelemetry({
        deviceId,
        sequence: i + 1,
        observedAt,
        bootId,
        sessionId,
        measurementType: OrbitMeasurementType.HEARTBEAT,
        value: 1,
      })
    );
  }
  return out;
}

/** Lunar Spec v1.0 wire envelope (partner field names preserved). */
export function buildLunarEnvelope(input: {
  physicalDeviceId: string;
  type: string;
  payload?: Record<string, unknown>;
  messageId?: string;
  timestamp?: Date;
  version?: string;
  mqttSecret?: string;
}): OrbitLunarEnvelope {
  const payload = { ...(input.payload ?? {}) };
  if (input.mqttSecret) payload.__mqttSecret = input.mqttSecret;
  return {
    messageId: input.messageId ?? `msg_${randomUUID().slice(0, 12)}`,
    deviceId: input.physicalDeviceId,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    type: input.type,
    version: input.version ?? "1.0",
    payload,
  };
}

export function buildLunarHeartbeat(physicalDeviceId: string, opts?: {
  timestamp?: Date;
  mqttSecret?: string;
  messageId?: string;
}) {
  return {
    topic: orbitLunarMqttTopic(physicalDeviceId, "heartbeat"),
    envelope: buildLunarEnvelope({
      physicalDeviceId,
      type: OrbitLunarMessageType.HEARTBEAT,
      payload: {},
      timestamp: opts?.timestamp,
      mqttSecret: opts?.mqttSecret,
      messageId: opts?.messageId,
    }),
  };
}

export function buildLunarTelemetry(physicalDeviceId: string, opts?: {
  timestamp?: Date;
  mqttSecret?: string;
  temperature?: number;
  voltage?: number;
  signalStrength?: number;
}) {
  return {
    topic: orbitLunarMqttTopic(physicalDeviceId, "telemetry"),
    envelope: buildLunarEnvelope({
      physicalDeviceId,
      type: OrbitLunarMessageType.TELEMETRY,
      timestamp: opts?.timestamp,
      mqttSecret: opts?.mqttSecret,
      payload: {
        temperature: opts?.temperature ?? 42.3,
        network: { type: "4G", signalStrength: opts?.signalStrength ?? -72 },
        power: { voltage: opts?.voltage ?? 12.4, batteryPercentage: 87 },
      },
    }),
  };
}

export function buildLunarStatus(physicalDeviceId: string, status: string, opts?: {
  timestamp?: Date;
  mqttSecret?: string;
  messageId?: string;
}) {
  return {
    topic: orbitLunarMqttTopic(physicalDeviceId, "status"),
    envelope: buildLunarEnvelope({
      physicalDeviceId,
      type: OrbitLunarMessageType.STATUS,
      timestamp: opts?.timestamp,
      mqttSecret: opts?.mqttSecret,
      messageId: opts?.messageId,
      payload: { status },
    }),
  };
}

/**
 * Baseline offline queue (Spec §7): events + command-acks only.
 * Telemetry/heartbeat are NOT queued — missing history stays unknown.
 */
export function buildLunarOfflineEventReplay(
  physicalDeviceId: string,
  events: Array<{ eventType: string; severity?: string; at: Date; messageId?: string }>
) {
  return events.map((e) => ({
    topic: orbitLunarMqttTopic(physicalDeviceId, "events"),
    envelope: buildLunarEnvelope({
      physicalDeviceId,
      type: OrbitLunarMessageType.EVENT,
      timestamp: e.at,
      messageId: e.messageId,
      payload: {
        eventType: e.eventType,
        severity: e.severity ?? "info",
      },
    }),
  }));
}

export function buildLunarCommandAck(physicalDeviceId: string, input: {
  commandId: string;
  status: string;
  messageId?: string;
  timestamp?: Date;
  extra?: Record<string, unknown>;
}) {
  return {
    topic: orbitLunarMqttTopic(physicalDeviceId, "command-ack"),
    envelope: buildLunarEnvelope({
      physicalDeviceId,
      type: OrbitLunarMessageType.COMMAND_ACK,
      messageId: input.messageId,
      timestamp: input.timestamp,
      payload: {
        commandId: input.commandId,
        status: input.status,
        ...(input.extra ?? {}),
      },
    }),
  };
}
