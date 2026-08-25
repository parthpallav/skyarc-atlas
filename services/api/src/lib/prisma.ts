import { PrismaClient } from "@prisma/client";

/** Transaction pooler (Supabase :6543) — serverless only; not for VPS API runtime. */
function isTransactionPoolerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.port === "6543") return true;
    return parsed.searchParams.get("pgbouncer") === "true";
  } catch {
    return url.includes(":6543") || url.includes("pgbouncer=true");
  }
}

function useTransactionPooler(): boolean {
  return process.env.DATABASE_USE_POOLER === "true";
}

/** Strip pgbouncer flag and normalize to session port when possible. */
function normalizeSessionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.port === "6543") {
      parsed.port = "5432";
    }
    parsed.searchParams.delete("pgbouncer");
    return parsed.toString();
  } catch {
    return url.replace(":6543", ":5432").replace(/[?&]pgbouncer=true/g, "");
  }
}

function connectionLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const port = parsed.port || "5432";
    const mode =
      port === "6543" || parsed.searchParams.get("pgbouncer") === "true"
        ? "transaction-pooler"
        : "session";
    return `${parsed.hostname}:${port} (${mode})`;
  } catch {
    return "unknown";
  }
}

function resolveRuntimeDatabaseUrl(): string | undefined {
  const directUrl = process.env.DIRECT_URL?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  // Long-running API (VPS): persistent session on port 5432 — never 6543 unless forced.
  if (!useTransactionPooler()) {
    if (directUrl) {
      return withPoolParams(normalizeSessionUrl(directUrl), true);
    }
    if (databaseUrl && !isTransactionPoolerUrl(databaseUrl)) {
      return withPoolParams(normalizeSessionUrl(databaseUrl), true);
    }
    if (databaseUrl) {
      const rewritten = normalizeSessionUrl(databaseUrl);
      console.warn(
        "DATABASE_URL uses transaction pooler; runtime upgraded to session port 5432. Set DIRECT_URL explicitly."
      );
      return withPoolParams(rewritten, true);
    }
    return undefined;
  }

  if (databaseUrl) {
    return withPoolParams(databaseUrl, false);
  }
  if (directUrl) {
    return withPoolParams(normalizeSessionUrl(directUrl), true);
  }
  return undefined;
}

function withPoolParams(url: string, session: boolean): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "30");
    }
    if (session) {
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
 * Runtime DB client — always uses session/persistent connection on VPS (port 5432).
 * Transaction pooler (:6543) only when DATABASE_USE_POOLER=true (serverless).
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
  if (!runtimeUrl) {
    throw new Error("No database URL configured (set DIRECT_URL or DATABASE_URL)");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.info(`Database connected — ${connectionLabel(runtimeUrl)}`);
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
