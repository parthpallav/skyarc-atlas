/**
 * Runtime Pulse service origin for Next.js route handlers.
 * Prefer PULSE_PROXY_TARGET on Vercel (e.g. http://HOST:3003).
 */
export function resolvePulseProxyTarget(): string {
  const fromEnv = process.env.PULSE_PROXY_TARGET?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:3003";
  }
  throw new Error(
    "PULSE_PROXY_TARGET is required in production. Set it to your Pulse service origin (e.g. http://HOST:3003)."
  );
}
