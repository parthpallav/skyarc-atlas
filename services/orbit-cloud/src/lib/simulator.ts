/**
 * Contract simulator — same payload schema as MQTT devices.
 * Does not require physical hardware or a live broker.
 */
import { randomUUID } from "node:crypto";
import {
  ORBIT_PAYLOAD_VERSION,
  OrbitMeasurementType,
  type OrbitTelemetryPayloadV1,
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
