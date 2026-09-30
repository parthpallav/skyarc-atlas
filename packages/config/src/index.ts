import { z } from "zod";
import { ScoringFactor } from "@skyarc/shared";

export const DEFAULT_SCORING_WEIGHTS: Record<ScoringFactor, number> = {
  [ScoringFactor.VISIBILITY]: 25,
  [ScoringFactor.AUDIENCE_FIT]: 20,
  [ScoringFactor.COMMERCIAL_FIT]: 15,
  [ScoringFactor.APPROACH_EXPOSURE]: 15,
  [ScoringFactor.BRAND_SUITABILITY]: 10,
  [ScoringFactor.VISUAL_COMPETITION]: 5,
  [ScoringFactor.LOCATION_QUALITY]: 5,
  [ScoringFactor.DATA_CONFIDENCE]: 5,
};

export const MEDIA_LIMITS = {
  maxImageBytes: 8 * 1024 * 1024,
  maxVideoBytes: 200 * 1024 * 1024,
  maxVoiceBytes: 10 * 1024 * 1024,
} as const;

const optionalUrl = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.includes("<")) return undefined;
    return trimmed;
  })
  .pipe(z.union([z.string().url(), z.undefined()]));

export const envSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  ORBIT_CLOUD_URL: z.string().url().optional(),
  ORBIT_SERVICE_TOKEN: z.string().min(16).optional(),
  ORBIT_WEBHOOK_SECRET: z.string().min(16).optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default("skyarc-atlas"),
  R2_ENDPOINT: optionalUrl,
  R2_PUBLIC_URL: optionalUrl,
  AI_PROVIDER: z.enum(["openrouter", "stub"]).default("stub"),
  OPENROUTER_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("openrouter/free"),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGINS: z
    .string()
    .default(
      "http://localhost:3000,http://127.0.0.1:3000,http://localhost:8081,http://127.0.0.1:8081"
    ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(input);
}

export function parseCorsOrigins(origins: string): string[] {
  return origins.split(",").map((o) => o.trim()).filter(Boolean);
}

/** Convert a CORS allowlist entry into a matcher. Supports one `*` wildcard segment. */
export function corsOriginAllowed(origin: string | undefined, allowlist: string): boolean {
  if (!origin) return true;
  const entries = parseCorsOrigins(allowlist);
  if (entries.includes("*")) return true;
  for (const entry of entries) {
    if (!entry.includes("*")) {
      if (entry === origin) return true;
      continue;
    }
    const escaped = entry
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    if (new RegExp(`^${escaped}$`, "i").test(origin)) return true;
  }
  return false;
}

/** Fastify/@fastify/cors-compatible origin option (array or callback). */
export function corsOriginOption(
  allowlist: string
): true | string[] | ((origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void) {
  const entries = parseCorsOrigins(allowlist);
  if (entries.includes("*")) return true;
  if (entries.every((e) => !e.includes("*"))) return entries;
  return (origin, cb) => {
    cb(null, corsOriginAllowed(origin, allowlist));
  };
}
