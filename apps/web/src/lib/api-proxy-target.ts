/**
 * Resolve the Atlas API origin for server-side proxying.
 * Prefer API_PROXY_TARGET (runtime env on Vercel). Never bake a vendor hostname.
 */
export function resolveApiProxyTarget(): string {
  const fromEnv = process.env.API_PROXY_TARGET?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  // Local / self-hosted Next only — never invent a cloud host.
  if (!process.env.VERCEL) {
    return "http://127.0.0.1:3001";
  }

  throw new Error(
    "API_PROXY_TARGET is required on Vercel. Set it to your Atlas API origin (e.g. http://HOST:PORT)."
  );
}
