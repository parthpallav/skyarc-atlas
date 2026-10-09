import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadDotEnv();

import { loadOrbitEnv } from "./env.js";
import { buildOrbitApp } from "./app.js";
import { prisma } from "./prisma.js";
import { flushOutbox } from "./events.js";
import { markStaleDevicesOffline } from "./state.js";
import { startOrbitMqttBridge, type OrbitMqttBridge } from "./mqtt/bridge.js";

const env = loadOrbitEnv();
const app = await buildOrbitApp(env);

const retentionMs = env.ORBIT_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

setInterval(async () => {
  try {
    await markStaleDevicesOffline(env.ORBIT_HEARTBEAT_TIMEOUT_MS);
    await flushOutbox(env);
    const cutoff = new Date(Date.now() - retentionMs);
    await prisma.orbitTelemetry.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch (err) {
    app.log.error(err);
  }
}, 15_000);

let mqttBridge: OrbitMqttBridge | null = null;
try {
  mqttBridge = await startOrbitMqttBridge(env, app.log);
} catch (err) {
  app.log.error({ err }, "MQTT bridge failed to start — HTTPS ingest still available");
}

const shutdown = async () => {
  if (mqttBridge) {
    try {
      await mqttBridge.stop();
    } catch (err) {
      app.log.error({ err }, "MQTT bridge stop failed");
    }
  }
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.ORBIT_PORT, host: "0.0.0.0" });
