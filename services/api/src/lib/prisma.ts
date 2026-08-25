import { PrismaClient } from "@prisma/client";

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

const databaseUrl = resolveDatabaseUrl();

/** Self-hosted Postgres on the same VPS — direct connection, no external pooler. */
export const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
});

const MAX_CONNECT_ATTEMPTS = 10;

function connectionLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const port = parsed.port || "5432";
    return `${parsed.hostname}:${port}`;
  } catch {
    return "postgres";
  }
}

/** Warm connection on startup with retries while Postgres container becomes ready. */
export async function connectDatabase(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.info(`Database connected — ${connectionLabel(databaseUrl)}`);
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

/** No-op — local Postgres does not drop idle connections like remote poolers. */
export function startDatabaseKeepalive(): void {
  // retained for server.ts compatibility
}

export async function shutdownDatabase(): Promise<void> {
  await prisma.$disconnect();
}
