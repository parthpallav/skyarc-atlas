import { PrismaClient } from "@prisma/client";

function useDirectConnection(): boolean {
  if (process.env.DATABASE_USE_DIRECT === "true") return true;
  if (process.env.DATABASE_USE_DIRECT === "false") return false;
  // Solo / dev API — prefer session connection over transaction pooler (6543).
  return process.env.NODE_ENV !== "production";
}

function resolveRuntimeDatabaseUrl(): string | undefined {
  const direct = useDirectConnection();
  const baseUrl = direct
    ? process.env.DIRECT_URL ?? process.env.DATABASE_URL
    : process.env.DATABASE_URL;

  if (!baseUrl) return undefined;

  try {
    const parsed = new URL(baseUrl);
    if (direct) {
      parsed.searchParams.delete("pgbouncer");
    }
    return withPoolParams(parsed.toString(), direct);
  } catch {
    return withPoolParams(baseUrl, direct);
  }
}

function withPoolParams(url: string, direct: boolean): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "30");
    }
    if (direct) {
      // Long-lived API process — small persistent pool on session port (5432).
      if (!parsed.searchParams.has("connection_limit")) {
        parsed.searchParams.set("connection_limit", "3");
      }
    } else {
      if (!parsed.searchParams.has("pool_timeout")) {
        parsed.searchParams.set("pool_timeout", "30");
      }
      if (!parsed.searchParams.has("connection_limit")) {
        parsed.searchParams.set("connection_limit", "1");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const runtimeUrl = resolveRuntimeDatabaseUrl();

/**
 * Runtime DB client.
 * Dev/solo: DIRECT_URL (session, port 5432) + keepalive to avoid idle timeouts.
 * Production: DATABASE_URL (transaction pooler) unless DATABASE_USE_DIRECT=true.
 */
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: runtimeUrl,
    },
  },
});

const MAX_CONNECT_ATTEMPTS = 5;
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;

let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/** Warm connection on startup — Supabase can be slow on first connect. */
export async function connectDatabase(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      const mode = useDirectConnection() ? "direct/session" : "pooler";
      console.info(`Database connected (${mode})`);
      return;
    } catch (error) {
      lastError = error;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      console.warn(
        `Database connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed, retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/** Ping DB periodically so idle session connections are not dropped. */
export function startDatabaseKeepalive(): void {
  if (keepaliveTimer || process.env.DATABASE_KEEPALIVE === "false") return;

  keepaliveTimer = setInterval(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      console.warn("Database keepalive failed, reconnecting…", error);
      try {
        await prisma.$disconnect();
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
        console.info("Database reconnected after keepalive failure");
      } catch (reconnectError) {
        console.error("Database reconnect failed", reconnectError);
      }
    }
  }, KEEPALIVE_INTERVAL_MS);

  keepaliveTimer.unref();
}

export async function shutdownDatabase(): Promise<void> {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  await prisma.$disconnect();
}
