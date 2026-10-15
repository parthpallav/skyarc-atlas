import { z } from "zod";
import { ORBIT_TENANT_ID } from "@skyarc/shared";

const schema = z.object({
  ORBIT_DATABASE_URL: z.string().min(1),
  ORBIT_SERVICE_TOKEN: z.string().min(16),
  ORBIT_WEBHOOK_SECRET: z.string().min(16),
  ATLAS_INTERNAL_URL: z.string().url().default("http://127.0.0.1:3001"),
  ORBIT_PORT: z.coerce.number().default(3002),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ORBIT_HEARTBEAT_TIMEOUT_MS: z.coerce.number().default(90_000),
  ORBIT_TELEMETRY_RETENTION_DAYS: z.coerce.number().default(14),

  /** When true, Orbit Cloud subscribes to the configured broker for device ingest. */
  ORBIT_MQTT_ENABLED: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  /** e.g. mqtts://xxxxx.s1.eu.hivemq.cloud:8883 or mqtt://localhost:1883 */
  ORBIT_MQTT_URL: z.string().optional(),
  ORBIT_MQTT_USERNAME: z.string().optional(),
  ORBIT_MQTT_PASSWORD: z.string().optional(),
  ORBIT_MQTT_CLIENT_ID: z.string().default("orbit-cloud-ingest"),
  ORBIT_MQTT_TENANT_ID: z.string().default(ORBIT_TENANT_ID),
});

export type OrbitEnv = z.infer<typeof schema>;

export function loadOrbitEnv(input: NodeJS.ProcessEnv = process.env): OrbitEnv {
  return schema.parse(input);
}
