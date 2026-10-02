import { z } from "zod";

const schema = z.object({
  PULSE_DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  BRIDGE_SERVICE_TOKEN: z.string().min(16),
  /** Shared with Atlas PULSE_SERVICE_TOKEN for server-side WhatsApp link resolve */
  ATLAS_SERVICE_TOKEN: z.string().min(16).optional(),
  BRIDGE_INTERNAL_URL: z.string().url().default("http://127.0.0.1:3004"),
  ATLAS_INTERNAL_URL: z.string().url().default("http://127.0.0.1:3001"),
  WEB_APP_URL: z.string().url().default("http://localhost:3000"),
  PULSE_PORT: z.coerce.number().default(3003),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type PulseEnv = z.infer<typeof schema>;

export function loadPulseEnv(input: NodeJS.ProcessEnv = process.env): PulseEnv {
  return schema.parse(input);
}
