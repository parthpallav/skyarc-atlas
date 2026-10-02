/**
 * Lunar MQTT Spec v1.0 envelope validation + normalization.
 * Preserves partner field names on the wire; maps to internal device UUID + 7b.v1
 * only inside Orbit Cloud. Proposed additions are optional.
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  ORBIT_LUNAR_MAX_MESSAGE_BYTES,
  ORBIT_LUNAR_MVP_COMMANDS,
  OrbitLunarAckStatus,
  OrbitLunarCommandName,
  OrbitLunarMessageType,
  OrbitLunarStatus,
  ORBIT_PAYLOAD_VERSION,
  type OrbitTelemetryPayloadV1,
} from "@skyarc/shared";

export { ORBIT_LUNAR_MAX_MESSAGE_BYTES };

export const orbitLunarEnvelopeSchema = z.object({
  messageId: z.string().min(1).max(128),
  deviceId: z.string().min(1).max(64),
  timestamp: z.string().datetime(),
  type: z.string().min(1).max(32),
  version: z.string().min(1).max(16),
  payload: z.record(z.unknown()).default({}),
});

export type OrbitLunarEnvelopeParsed = z.infer<typeof orbitLunarEnvelopeSchema>;

export function validateLunarMessageBytes(
  raw: string | Buffer
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  if (Buffer.byteLength(text, "utf8") > ORBIT_LUNAR_MAX_MESSAGE_BYTES) {
    return { ok: false, reason: `Payload exceeds ${ORBIT_LUNAR_MAX_MESSAGE_BYTES} bytes` };
  }
  return { ok: true, text };
}

/** Scrub secrets before durable persist — never store device credentials. */
export function scrubLunarSecrets(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const clone = { ...(payload as Record<string, unknown>) };
  delete clone.__mqttSecret;
  delete clone.deviceSecret;
  delete clone.password;
  if (clone.payload && typeof clone.payload === "object" && !Array.isArray(clone.payload)) {
    const inner = { ...(clone.payload as Record<string, unknown>) };
    delete inner.__mqttSecret;
    delete inner.deviceSecret;
    delete inner.password;
    clone.payload = inner;
  }
  return clone;
}

/**
 * Normalize Lunar envelope → internal 7b.v1 measurement shape for storage pipeline.
 * Does not invent agreed sensor meaning. Voltage/signalStrength stay as typed values only.
 */
export function normalizeLunarToInternal(input: {
  envelope: OrbitLunarEnvelopeParsed;
  internalDeviceId: string;
  channel: string;
}): {
  kind: "measurement" | "status" | "event" | "command_ack" | "unsupported";
  messageId: string;
  observedAt: string;
  measurement?: OrbitTelemetryPayloadV1;
  status?: string;
  eventType?: string;
  severity?: string;
  commandAck?: {
    commandId: string;
    status: string;
    detail?: Record<string, unknown>;
  };
  reason?: string;
} {
  const { envelope, internalDeviceId, channel } = input;
  const messageId = envelope.messageId;
  const observedAt = envelope.timestamp;
  const payload = envelope.payload ?? {};

  // Optional proposed fields — accepted when present, never required
  const bootId =
    typeof payload.bootId === "string" && payload.bootId.length > 0
      ? payload.bootId
      : "unknown";
  const sessionId =
    typeof payload.sessionId === "string" && payload.sessionId.length > 0
      ? payload.sessionId
      : "unknown";
  const sequence =
    typeof payload.sequence === "number" && Number.isInteger(payload.sequence) && payload.sequence >= 0
      ? payload.sequence
      : 0;
  const firmwareVersion =
    typeof payload.firmwareVersion === "string" && payload.firmwareVersion.length > 0
      ? payload.firmwareVersion
      : typeof payload.firmware === "string"
        ? payload.firmware
        : "unknown";

  const typedValues: Record<string, number | string | boolean | null> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      typedValues[k] = v;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      // Flatten one level of nested objects (e.g. network, power) without interpreting
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        if (nv === null || typeof nv === "string" || typeof nv === "number" || typeof nv === "boolean") {
          typedValues[`${k}.${nk}`] = nv;
        }
      }
    }
  }

  if (channel === "heartbeat" || envelope.type === OrbitLunarMessageType.HEARTBEAT) {
    return {
      kind: "measurement",
      messageId,
      observedAt,
      measurement: {
        schemaVersion: ORBIT_PAYLOAD_VERSION,
        eventId: messageIdToEventId(messageId),
        deviceId: internalDeviceId,
        bootId,
        sessionId,
        sequence,
        observedAt,
        firmwareVersion,
        measurementType: "heartbeat",
        value: 1,
        unit: null,
        typedValues,
        qualityFlags: ["lunar_v1", ...(bootId === "unknown" ? ["bootId_unknown"] : [])],
        includesImage: false,
      },
    };
  }

  if (channel === "telemetry" || envelope.type === OrbitLunarMessageType.TELEMETRY) {
    // Store as diagnostic observation — do not map voltage→screen_power without agreement
    const temperature = typeof payload.temperature === "number" ? payload.temperature : null;
    return {
      kind: "measurement",
      messageId,
      observedAt,
      measurement: {
        schemaVersion: ORBIT_PAYLOAD_VERSION,
        eventId: messageIdToEventId(messageId),
        deviceId: internalDeviceId,
        bootId,
        sessionId,
        sequence,
        observedAt,
        firmwareVersion,
        measurementType: "diagnostic",
        value: temperature,
        unit: temperature != null ? "celsius_example" : null,
        typedValues,
        qualityFlags: [
          "lunar_v1",
          "units_unconfirmed",
          "do_not_infer_screen_power_from_voltage",
          "do_not_infer_cellular_from_signalStrength",
        ],
        includesImage: false,
      },
    };
  }

  if (channel === "status" || envelope.type === OrbitLunarMessageType.STATUS) {
    const status =
      typeof payload.status === "string"
        ? payload.status
        : typeof payload.state === "string"
          ? payload.state
          : String(payload.status ?? "UNKNOWN");
    return {
      kind: "status",
      messageId,
      observedAt,
      status,
      measurement: {
        schemaVersion: ORBIT_PAYLOAD_VERSION,
        eventId: messageIdToEventId(messageId),
        deviceId: internalDeviceId,
        bootId,
        sessionId,
        sequence,
        observedAt,
        firmwareVersion,
        measurementType: "connectivity",
        value: status,
        typedValues: { ...typedValues, lunarStatus: status },
        qualityFlags: [
          "lunar_v1",
          "status_retained_or_lwt_possible",
          "lwt_timestamp_is_not_disconnect_time",
        ],
        includesImage: false,
      },
    };
  }

  if (channel === "events" || envelope.type === OrbitLunarMessageType.EVENT) {
    const eventType =
      typeof payload.eventType === "string" ? payload.eventType : "UNKNOWN_EVENT";
    const severity =
      typeof payload.severity === "string" ? payload.severity : "info";
    return {
      kind: "event",
      messageId,
      observedAt,
      eventType,
      severity,
      measurement: {
        schemaVersion: ORBIT_PAYLOAD_VERSION,
        eventId: messageIdToEventId(messageId),
        deviceId: internalDeviceId,
        bootId,
        sessionId,
        sequence,
        observedAt,
        firmwareVersion,
        measurementType: "diagnostic",
        value: eventType,
        typedValues: { ...typedValues, eventType, severity },
        qualityFlags: ["lunar_v1", "device_event"],
        includesImage: false,
      },
    };
  }

  if (channel === "command-ack" || envelope.type === OrbitLunarMessageType.COMMAND_ACK) {
    const commandId =
      typeof payload.commandId === "string" ? payload.commandId : "";
    const status =
      typeof payload.status === "string" ? payload.status : String(payload.ackStatus ?? "");
    if (!commandId) {
      return { kind: "unsupported", messageId, observedAt, reason: "command-ack missing commandId" };
    }
    return {
      kind: "command_ack",
      messageId,
      observedAt,
      commandAck: {
        commandId,
        status,
        detail: payload as Record<string, unknown>,
      },
    };
  }

  return {
    kind: "unsupported",
    messageId,
    observedAt,
    reason: `Unsupported Lunar channel/type: ${channel}/${envelope.type}`,
  };
}

/** messageId may be non-UUID; raw event PK needs a stable string — keep messageId as-is when unique. */
export function messageIdToEventId(messageId: string): string {
  // Prefer opaque string identity; UUID schema in legacy 7b requires UUID —
  // Lunar path uses messageId directly on inbox/raw tables (string PK).
  return messageId;
}

export function isMvpCommand(command: string): command is (typeof ORBIT_LUNAR_MVP_COMMANDS)[number] {
  return (ORBIT_LUNAR_MVP_COMMANDS as readonly string[]).includes(command);
}

export function buildLunarCommandEnvelope(input: {
  physicalDeviceId: string;
  commandId: string;
  command: string;
  parameters?: Record<string, unknown>;
  messageId?: string;
  expiresAt?: string | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    commandId: input.commandId,
    command: input.command,
    parameters: input.parameters ?? {},
  };
  // Proposed: only include when expiry support enabled
  if (input.expiresAt) payload.expiresAt = input.expiresAt;

  return {
    messageId: input.messageId ?? `msg_cmd_${input.commandId}`,
    deviceId: input.physicalDeviceId,
    timestamp: new Date().toISOString(),
    type: OrbitLunarMessageType.COMMAND,
    version: "1.0",
    payload,
  };
}

export function buildLunarConfigEnvelope(input: {
  physicalDeviceId: string;
  configVersion: number;
  config: Record<string, unknown>;
  messageId?: string;
}): Record<string, unknown> {
  return {
    messageId: input.messageId ?? `msg_cfg_${input.configVersion}_${randomUUID().slice(0, 8)}`,
    deviceId: input.physicalDeviceId,
    timestamp: new Date().toISOString(),
    type: OrbitLunarMessageType.CONFIG,
    version: "1.0",
    payload: {
      configVersion: input.configVersion,
      ...input.config,
    },
  };
}

export const LUNAR_STATUS_VALUES = Object.values(OrbitLunarStatus);
export const LUNAR_ACK_VALUES = Object.values(OrbitLunarAckStatus);
export { OrbitLunarCommandName, OrbitLunarAckStatus, OrbitLunarStatus };
