import { z } from "zod";

const schema = z.object({
  BRIDGE_DATABASE_URL: z.string().min(1),
  BRIDGE_SERVICE_TOKEN: z.string().min(16),
  BRIDGE_PORT: z.coerce.number().default(3004),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
});

export type BridgeEnv = z.infer<typeof schema>;

export function loadBridgeEnv(input: NodeJS.ProcessEnv = process.env): BridgeEnv {
  return schema.parse(input);
}

export function whatsappConfigured(env: BridgeEnv): boolean {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}
