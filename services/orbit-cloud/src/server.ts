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
import { startMqttConsumer } from "./mqtt/consumer.js";
import { applyRetentionPolicies } from "./lib/retention.js";
import { processPendingInbox } from "./lib/ingest.js";

const env = loadOrbitEnv();
const app = await buildOrbitApp(env);
const mqtt = await startMqttConsumer(env);
if (mqtt) {
  app.log.info("MQTT consumer started");
} else {
  app.log.info("MQTT not configured — HTTPS ingest + simulator contracts available");
}

setInterval(async () => {
  try {
    await markStaleDevicesOffline(env.ORBIT_HEARTBEAT_TIMEOUT_MS);
    await processPendingInbox(prisma, 50);
    await flushOutbox(env);
  } catch (err) {
    app.log.error(err);
  }
}, 15_000);

setInterval(async () => {
  try {
    await applyRetentionPolicies(prisma, env);
  } catch (err) {
    app.log.error(err);
  }
}, 60 * 60 * 1000);

const shutdown = async () => {
  if (mqtt) await mqtt.stop();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.ORBIT_PORT, host: "0.0.0.0" });
