import { describe, expect, it } from "vitest";
import {
  capabilityStatus,
  connectivityFromHeartbeat,
  orbitMqttTopic,
  parseOrbitMqttTopic,
  orbitLunarMqttTopic,
  parseOrbitLunarMqttTopic,
  lunarDeviceMayPublish,
  lunarDeviceMaySubscribe,
  lunarMqttClientId,
  lunarMqttUsername,
  ORBIT_PAYLOAD_VERSION,
  ORBIT_LUNAR_PROPOSED_ADDITIONS,
  OrbitMeasurementType,
  OrbitLunarCommandName,
} from "@skyarc/shared";
import { orbitTelemetryPayloadV1Schema, scrubSecretsFromPayload } from "../lib/payload.js";
import {
  buildSimulatedTelemetry,
  buildOfflineReplayBatch,
  buildLunarHeartbeat,
  buildLunarTelemetry,
  buildLunarStatus,
  buildLunarOfflineEventReplay,
  buildLunarCommandAck,
  buildLunarEnvelope,
} from "../lib/simulator.js";
import {
  normalizeLunarToInternal,
  orbitLunarEnvelopeSchema,
  scrubLunarSecrets,
  isMvpCommand,
  validateLunarMessageBytes,
} from "../lib/lunar-envelope.js";
import { estimateStorageBytes } from "../lib/retention.js";
import { credentialsMatch, hashSecret } from "../crypto.js";

describe("orbit payload contracts", () => {
  it("validates versioned telemetry and rejects camera images by default", () => {
    const ok = buildSimulatedTelemetry({
      deviceId: "11111111-1111-4111-8111-111111111111",
      measurementType: OrbitMeasurementType.HEARTBEAT,
    });
    expect(ok.schemaVersion).toBe(ORBIT_PAYLOAD_VERSION);
    expect(orbitTelemetryPayloadV1Schema.safeParse(ok).success).toBe(true);

    const withImage = { ...ok, includesImage: true };
    expect(orbitTelemetryPayloadV1Schema.safeParse(withImage).success).toBe(false);
  });

  it("requires playback creative/campaign ids for trusted playback shape", () => {
    const playback = buildSimulatedTelemetry({
      deviceId: "11111111-1111-4111-8111-111111111111",
      measurementType: OrbitMeasurementType.PLAYBACK,
      value: "playing",
    });
    expect(orbitTelemetryPayloadV1Schema.safeParse(playback).success).toBe(false);
    const trusted = buildSimulatedTelemetry({
      deviceId: "11111111-1111-4111-8111-111111111111",
      measurementType: OrbitMeasurementType.PLAYBACK,
      value: "playing",
      creativeId: "22222222-2222-4222-8222-222222222222",
      campaignId: "33333333-3333-4333-8333-333333333333",
    });
    expect(orbitTelemetryPayloadV1Schema.safeParse(trusted).success).toBe(true);
  });
});

describe("Lunar Spec v1.0 envelope + topics", () => {
  it("parses skyarc/v1/orbit/{deviceId}/{channel}", () => {
    const topic = orbitLunarMqttTopic("ORBIT-0001", "telemetry");
    expect(topic).toBe("skyarc/v1/orbit/ORBIT-0001/telemetry");
    expect(parseOrbitLunarMqttTopic(topic)).toEqual({
      physicalDeviceId: "ORBIT-0001",
      channel: "telemetry",
    });
    expect(parseOrbitLunarMqttTopic("orbit/t/d/telemetry")).toBeNull();
  });

  it("enforces directional publish/subscribe ACLs", () => {
    expect(lunarDeviceMayPublish("ORBIT-0001", "ORBIT-0001", "telemetry")).toBe(true);
    expect(lunarDeviceMayPublish("ORBIT-0001", "ORBIT-0001", "commands")).toBe(false);
    expect(lunarDeviceMayPublish("ORBIT-0001", "ORBIT-0002", "telemetry")).toBe(false);
    expect(lunarDeviceMaySubscribe("ORBIT-0001", "ORBIT-0001", "config")).toBe(true);
    expect(lunarDeviceMaySubscribe("ORBIT-0001", "ORBIT-0001", "events")).toBe(false);
  });

  it("documents client id and username forms without inventing production creds", () => {
    expect(lunarMqttClientId("ORBIT-0001")).toBe("skyarc-orbit-ORBIT-0001");
    expect(lunarMqttUsername("ORBIT-0001")).toBe("orbit_ORBIT0001");
  });

  it("validates partner envelope fields (messageId, deviceId, timestamp, type, version, payload)", () => {
    const { envelope } = buildLunarHeartbeat("ORBIT-0001");
    expect(orbitLunarEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(envelope).toMatchObject({
      deviceId: "ORBIT-0001",
      type: "heartbeat",
      version: "1.0",
    });
    expect(envelope.messageId).toBeTruthy();
  });

  it("normalizes Lunar telemetry without interpreting voltage as screen power", () => {
    const { envelope } = buildLunarTelemetry("ORBIT-0001", { voltage: 12.4, signalStrength: -72 });
    const n = normalizeLunarToInternal({
      envelope: orbitLunarEnvelopeSchema.parse(envelope),
      internalDeviceId: "11111111-1111-4111-8111-111111111111",
      channel: "telemetry",
    });
    expect(n.kind).toBe("measurement");
    expect(n.measurement?.measurementType).toBe("diagnostic");
    expect(n.measurement?.qualityFlags).toContain("do_not_infer_screen_power_from_voltage");
    expect(n.measurement?.typedValues?.["power.voltage"]).toBe(12.4);
  });

  it("normalizes status / LWT-shaped OFFLINE without claiming disconnect clock accuracy", () => {
    const { envelope } = buildLunarStatus("ORBIT-0001", "OFFLINE", {
      timestamp: new Date("2020-01-01T00:00:00Z"),
    });
    const n = normalizeLunarToInternal({
      envelope: orbitLunarEnvelopeSchema.parse(envelope),
      internalDeviceId: "11111111-1111-4111-8111-111111111111",
      channel: "status",
    });
    expect(n.kind).toBe("status");
    expect(n.status).toBe("OFFLINE");
    expect(n.measurement?.qualityFlags).toContain("lwt_timestamp_is_not_disconnect_time");
  });

  it("supports baseline offline event replay (not telemetry/heartbeat queue)", () => {
    const replay = buildLunarOfflineEventReplay("ORBIT-0001", [
      { eventType: "NETWORK_LOST", at: new Date("2026-09-01T00:00:00Z") },
      { eventType: "NETWORK_RESTORED", at: new Date("2026-09-01T00:05:00Z") },
    ]);
    expect(replay).toHaveLength(2);
    expect(replay[0].topic).toContain("/events");
    expect(replay.every((r) => r.envelope.type === "event")).toBe(true);
  });

  it("correlates command-ack by commandId", () => {
    const ack = buildLunarCommandAck("ORBIT-0001", {
      commandId: "cmd-1",
      status: "COMPLETED",
    });
    const n = normalizeLunarToInternal({
      envelope: orbitLunarEnvelopeSchema.parse(ack.envelope),
      internalDeviceId: "11111111-1111-4111-8111-111111111111",
      channel: "command-ack",
    });
    expect(n.kind).toBe("command_ack");
    expect(n.commandAck?.commandId).toBe("cmd-1");
    expect(n.commandAck?.status).toBe("COMPLETED");
  });

  it("limits MVP commands and lists proposed additions as unconfirmed", () => {
    expect(isMvpCommand(OrbitLunarCommandName.RESTART)).toBe(true);
    expect(isMvpCommand("enable_camera")).toBe(false);
    expect(ORBIT_LUNAR_PROPOSED_ADDITIONS.length).toBeGreaterThan(3);
  });

  it("enforces Lunar 64KiB bound", () => {
    const ok = validateLunarMessageBytes("{}");
    expect(ok.ok).toBe(true);
    const big = "x".repeat(70_000);
    expect(validateLunarMessageBytes(big).ok).toBe(false);
  });

  it("scrubs secrets from Lunar envelopes before persist shape", () => {
    const env = buildLunarEnvelope({
      physicalDeviceId: "ORBIT-0001",
      type: "heartbeat",
      mqttSecret: "sekret",
    });
    const scrubbed = scrubLunarSecrets(env) as { payload: Record<string, unknown> };
    expect(scrubbed.payload.__mqttSecret).toBeUndefined();
  });
});

describe("capabilities", () => {
  it("distinguishes edge vs sense vs player", () => {
    expect(capabilityStatus("orbit_edge", "traffic_count")).toBe("unsupported");
    expect(capabilityStatus("orbit_edge_sense", "traffic_count")).toBe("supported");
    expect(capabilityStatus("media_player", "playback")).toBe("supported");
    expect(capabilityStatus("orbit_edge", "heartbeat")).toBe("supported");
  });
});

describe("state correctness helpers", () => {
  it("does not mark online for stale historical heartbeats", () => {
    const receivedAt = new Date("2026-10-02T12:00:00Z");
    const stale = connectivityFromHeartbeat({
      observedAt: new Date("2026-10-01T12:00:00Z"),
      receivedAt,
      maxSkewMs: 120_000,
      staleAfterMs: 300_000,
    });
    expect(stale.markOnlineNow).toBe(false);
    expect(stale.connectivity).toBe("stale");

    const fresh = connectivityFromHeartbeat({
      observedAt: new Date("2026-10-02T11:59:30Z"),
      receivedAt,
      maxSkewMs: 120_000,
      staleAfterMs: 300_000,
    });
    expect(fresh.markOnlineNow).toBe(true);
  });
});

describe("legacy mqtt topic helpers (deprecated)", () => {
  it("still parses legacy orbit/{tenant}/{device}/{channel}", () => {
    const topic = orbitMqttTopic("tenant-a", "dev-1", "telemetry");
    expect(topic).toBe("orbit/tenant-a/dev-1/telemetry");
    expect(parseOrbitMqttTopic(topic)).toEqual({
      tenantId: "tenant-a",
      deviceId: "dev-1",
      channel: "telemetry",
    });
  });

  it("matches credentials without logging secrets", () => {
    const secret = "device-secret-value";
    expect(credentialsMatch(secret, hashSecret(secret))).toBe(true);
    expect(credentialsMatch(secret, hashSecret("other"))).toBe(false);
  });
});

describe("simulator offline replay", () => {
  it("builds ordered sequences for reconnect replay", () => {
    const batch = buildOfflineReplayBatch(
      "11111111-1111-4111-8111-111111111111",
      3,
      new Date("2026-09-01T00:00:00Z"),
      60_000
    );
    expect(batch).toHaveLength(3);
    expect(batch[0].sequence).toBe(1);
    expect(batch[2].sequence).toBe(3);
    expect(batch.every((e) => e.bootId === batch[0].bootId)).toBe(true);
  });
});

describe("retention estimates", () => {
  it("computes rough storage without inventing DB", () => {
    const est = estimateStorageBytes({
      devices: 100,
      eventsPerDevicePerDay: 1440,
      rawDays: 14,
      avgPayloadBytes: 400,
    });
    expect(est.rawBytes).toBeGreaterThan(0);
    expect(est.totalBytes).toBeGreaterThan(est.rawBytes);
  });
});

describe("secret scrubbing", () => {
  it("strips mqtt secrets before durable persist shape", () => {
    const scrubbed = scrubSecretsFromPayload({
      eventId: "11111111-1111-4111-8111-111111111111",
      typedValues: { __mqttSecret: "sekret", rssi: -70 },
    }) as { typedValues: Record<string, unknown> };
    expect(scrubbed.typedValues.__mqttSecret).toBeUndefined();
    expect(scrubbed.typedValues.rssi).toBe(-70);
  });
});
