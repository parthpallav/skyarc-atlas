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
});

export type OrbitEnv = z.infer<typeof schema>;

export function loadOrbitEnv(input: NodeJS.ProcessEnv = process.env): OrbitEnv {
  return schema.parse(input);
}
