import { describe, expect, it } from "vitest";
import {
  capabilityStatus,
  connectivityFromHeartbeat,
  orbitMqttTopic,
  parseOrbitMqttTopic,
  ORBIT_PAYLOAD_VERSION,
  OrbitMeasurementType,
} from "@skyarc/shared";
import { orbitTelemetryPayloadV1Schema, scrubSecretsFromPayload } from "../lib/payload.js";
import { buildSimulatedTelemetry, buildOfflineReplayBatch } from "../lib/simulator.js";
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

describe("mqtt topic binding", () => {
  it("parses and builds topics", () => {
    const topic = orbitMqttTopic("tenant-a", "dev-1", "telemetry");
    expect(topic).toBe("orbit/tenant-a/dev-1/telemetry");
    expect(parseOrbitMqttTopic(topic)).toEqual({
      tenantId: "tenant-a",
      deviceId: "dev-1",
      channel: "telemetry",
    });
    expect(parseOrbitMqttTopic("bad")).toBeNull();
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
