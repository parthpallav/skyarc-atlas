import { describe, expect, it } from "vitest";
import {
  OrbitMqttChannel,
  ORBIT_TENANT_ID,
  orbitMqttAclHints,
  orbitMqttDeviceTopics,
  orbitMqttServiceSubscribeFilter,
  orbitMqttTopic,
  parseOrbitMqttTopic,
} from "@skyarc/shared";

describe("orbit MQTT topics", () => {
  const deviceId = "11111111-1111-4111-8111-111111111111";

  it("builds device topics under tenant prefix", () => {
    expect(orbitMqttTopic({ deviceId, channel: OrbitMqttChannel.HEARTBEAT })).toBe(
      `orbit/${ORBIT_TENANT_ID}/${deviceId}/heartbeat`
    );
    expect(orbitMqttDeviceTopics({ deviceId }).telemetry).toBe(
      `orbit/${ORBIT_TENANT_ID}/${deviceId}/telemetry`
    );
  });

  it("parses ingest topics and rejects junk", () => {
    const ok = parseOrbitMqttTopic(`orbit/skyarc/${deviceId}/heartbeat`);
    expect(ok).toEqual({
      tenantId: "skyarc",
      deviceId,
      channel: "heartbeat",
    });
    expect(parseOrbitMqttTopic("sensors/foo")).toBeNull();
    expect(parseOrbitMqttTopic(`orbit/skyarc/${deviceId}/unknown`)).toBeNull();
  });

  it("service filter covers all devices for a tenant", () => {
    expect(orbitMqttServiceSubscribeFilter()).toBe("orbit/skyarc/+/+");
  });

  it("ACL hints bind publish to device prefix only", () => {
    const acl = orbitMqttAclHints({ deviceId });
    expect(acl.username).toBe(deviceId);
    expect(acl.publishAllow.every((t) => t.includes(deviceId))).toBe(true);
  });
});
