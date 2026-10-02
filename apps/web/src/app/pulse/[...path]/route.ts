import { resolvePulseProxyTarget } from "@/lib/pulse-proxy-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function stagingIsolationError(targetBase: string): string | null {
  if (process.env.STAGING_PROXY_ISOLATION !== "1") return null;
  try {
    const u = new URL(targetBase);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    if (port === "3001" || port === "3003") {
      return `Staging proxy isolation refused production-like port ${port} on ${u.hostname}`;
    }
  } catch {
    return "Staging proxy isolation: invalid PULSE_PROXY_TARGET";
  }
  return null;
}

async function proxy(request: Request, pathSegments: string[]): Promise<Response> {
  let targetBase: string;
  try {
    targetBase = resolvePulseProxyTarget();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pulse proxy misconfigured";
    return Response.json({ error: message, code: "PROXY_MISCONFIGURED" }, { status: 500 });
  }

  const isolation = stagingIsolationError(targetBase);
  if (isolation) {
    return Response.json(
      { error: isolation, code: "STAGING_PROXY_ISOLATION" },
      { status: 503 }
    );
  }

  const incoming = new URL(request.url);
  const upstreamPath = `/${pathSegments.map(encodeURIComponent).join("/")}`;
  const upstreamUrl = `${targetBase}${upstreamPath}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "upstream unreachable";
    return Response.json(
      {
        error: "Staging Pulse unavailable",
        code: "STAGING_PULSE_UNAVAILABLE",
        detail,
        targetHost: (() => {
          try {
            return new URL(targetBase).host;
          } catch {
            return "invalid";
          }
        })(),
      },
      { status: 503 }
    );
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      outHeaders.set(key, value);
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Ctx): Promise<Response> {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
