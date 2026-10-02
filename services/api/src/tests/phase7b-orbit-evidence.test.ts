import { describe, expect, it } from "vitest";
import {
  associateObservationToBookings,
  mappingCoversInstant,
} from "../lib/orbit/device-mapping.js";
import {
  capabilityStatus,
  connectivityFromHeartbeat,
  OrbitMeasurementType,
} from "@skyarc/shared";

describe("device mapping temporal rules", () => {
  it("covers instants within [validFrom, validTo)", () => {
    const m = {
      validFrom: new Date("2026-01-01T00:00:00Z"),
      validTo: new Date("2026-02-01T00:00:00Z"),
    };
    expect(mappingCoversInstant(m, new Date("2026-01-15T00:00:00Z"))).toBe(true);
    expect(mappingCoversInstant(m, new Date("2026-02-01T00:00:00Z"))).toBe(false);
    expect(mappingCoversInstant({ ...m, validTo: null }, new Date("2026-06-01T00:00:00Z"))).toBe(
      true
    );
  });
});

describe("campaign association rules", () => {
  const items = [
    {
      id: "bi1",
      bookingId: "b1",
      inventoryId: "i1",
      screenId: "s1",
      startDate: new Date("2026-11-01T00:00:00Z"),
      endDate: new Date("2026-11-30T00:00:00Z"),
      status: "CONFIRMED",
    },
    {
      id: "bi2",
      bookingId: "b2",
      inventoryId: "i2",
      screenId: "s1",
      startDate: new Date("2026-11-01T00:00:00Z"),
      endDate: new Date("2026-11-30T00:00:00Z"),
      status: "CONFIRMED",
    },
  ];

  it("labels screen traffic as contextual — not measured impressions", () => {
    const r = associateObservationToBookings({
      observationAt: new Date("2026-11-15T00:00:00Z"),
      screenId: "s1",
      measurementType: OrbitMeasurementType.TRAFFIC_COUNT,
      capabilityOk: true,
      bookingItems: items,
    });
    expect(r.associationKind).toBe("contextual_screen");
    expect(r.affectedBookingItemIds).toHaveLength(2);
    expect(r.limitations.join(" ")).toMatch(/not measured impressions/i);
  });

  it("requires trusted playback ids", () => {
    const r = associateObservationToBookings({
      observationAt: new Date("2026-11-15T00:00:00Z"),
      screenId: "s1",
      measurementType: OrbitMeasurementType.PLAYBACK,
      capabilityOk: true,
      bookingItems: items,
      hasTrustedPlaybackIds: false,
    });
    expect(r.associationKind).toBe("none");
  });

  it("suppresses association when capability missing", () => {
    expect(capabilityStatus("orbit_edge", "traffic_count")).toBe("unsupported");
    const r = associateObservationToBookings({
      observationAt: new Date("2026-11-15T00:00:00Z"),
      screenId: "s1",
      measurementType: OrbitMeasurementType.TRAFFIC_COUNT,
      capabilityOk: false,
      bookingItems: items,
    });
    expect(r.associationKind).toBe("none");
  });
});

describe("heartbeat vs screen power", () => {
  it("documents connectivity-only semantics", () => {
    const c = connectivityFromHeartbeat({
      observedAt: new Date(),
      receivedAt: new Date(),
      maxSkewMs: 120_000,
      staleAfterMs: 300_000,
    });
    expect(c.markOnlineNow).toBe(true);
    expect(c.reason).toMatch(/Fresh heartbeat/);
  });
});
