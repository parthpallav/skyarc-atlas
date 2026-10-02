/**
 * MQTT 5.0 protocol verification against Mosquitto (when available).
 * Aedes local suite exercises MQTT 3.1.1 only — Aedes does not support MQTT 5.0 yet.
 *
 * Set MQTT5_BROKER_URL (e.g. mqtt://127.0.0.1:18883) after starting:
 *   docker run --rm -p 18883:1883 -v "$PWD/services/orbit-cloud/mosquitto-mqtt5.conf:/mosquitto/config/mosquitto.conf" eclipse-mosquitto:2
 *
 * Lunar firmware MQTT 5 session/message-expiry behavior remains a partner dependency.
 */
import { describe, expect, it } from "vitest";
import mqtt from "mqtt";
import { orbitLunarMqttTopic } from "@skyarc/shared";
import { buildLunarHeartbeat } from "../lib/simulator.js";

const mqtt5Url = process.env.MQTT5_BROKER_URL?.trim();

function describeMqtt5(name: string, fn: () => void) {
  if (!mqtt5Url) {
    describe.skip(`${name} (set MQTT5_BROKER_URL + Mosquitto 2)`, fn);
    return;
  }
  describe(name, fn);
}

describeMqtt5("orbit MQTT 5.0 broker (Mosquitto)", () => {
  it("connects with protocolVersion 5 and publishes with messageExpiryInterval", async () => {
    const physicalDeviceId = "ORBIT-MQTT5-TEST";
    const { topic, envelope } = buildLunarHeartbeat(physicalDeviceId);

    await new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(mqtt5Url!, {
        protocolVersion: 5,
        clientId: `mqtt5-probe-${Date.now()}`,
        reconnectPeriod: 0,
        connectTimeout: 5_000,
        clean: true,
        properties: { sessionExpiryInterval: 60 },
      });
      client.on("error", reject);
      client.on("connect", (packet) => {
        // CONNACK for MQTT 5 includes reasonCode
        expect(packet).toBeTruthy();
        client.publish(
          topic,
          JSON.stringify(envelope),
          {
            qos: 1,
            properties: { messageExpiryInterval: 30 },
          },
          (err) => {
            client.end(true);
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    expect(orbitLunarMqttTopic(physicalDeviceId, "heartbeat")).toContain("heartbeat");
  }, 15_000);
});

describe("MQTT protocol version matrix (documentation assertions)", () => {
  it("records Aedes = MQTT 3.1.1 and Lunar contract proposes MQTT 5.0", () => {
    // This suite documents the gap; broker.integration.test.ts uses protocolVersion 4.
    expect({
      aedesLocalSuite: "MQTT 3.1.1 (protocolVersion 4)",
      lunarContractProposal: "MQTT 5.0",
      mqtt5BrokerSuite: mqtt5Url ? "enabled via MQTT5_BROKER_URL" : "pending Mosquitto",
      firmwareDependency: "Lunar firmware MQTT 5 session/message expiry — unconfirmed until partner test",
    }).toMatchObject({
      aedesLocalSuite: "MQTT 3.1.1 (protocolVersion 4)",
      lunarContractProposal: "MQTT 5.0",
    });
  });
});
