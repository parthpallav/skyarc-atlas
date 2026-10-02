import { z } from "zod";

const schema = z.object({
  ORBIT_DATABASE_URL: z.string().min(1),
  ORBIT_SERVICE_TOKEN: z.string().min(16),
  ORBIT_WEBHOOK_SECRET: z.string().min(16),
  ATLAS_INTERNAL_URL: z.string().url().default("http://127.0.0.1:3001"),
  ORBIT_PORT: z.coerce.number().default(3002),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ORBIT_HEARTBEAT_TIMEOUT_MS: z.coerce.number().default(90_000),
  ORBIT_TELEMETRY_RETENTION_DAYS: z.coerce.number().default(14),
  ORBIT_AGGREGATE_RETENTION_DAYS: z.coerce.number().default(365),
  ORBIT_MQTT_URL: z.string().url().optional(),
  ORBIT_MQTT_USERNAME: z.string().optional(),
  ORBIT_MQTT_PASSWORD: z.string().optional(),
  ORBIT_MAX_CLOCK_SKEW_MS: z.coerce.number().default(120_000),
  ORBIT_STALE_OBSERVATION_MS: z.coerce.number().default(300_000),
});

export type OrbitEnv = z.infer<typeof schema>;

export function loadOrbitEnv(input: NodeJS.ProcessEnv = process.env): OrbitEnv {
  return schema.parse(input);
}
