"use client";

// TypeScript declarations for Microsoft Clarity global API
declare global {
  interface Window {
    clarity?: {
      (command: "identify", customId: string, customSessionId?: string, customPageId?: string, friendlyName?: string): void;
      (command: "set", key: string, value: string | string[]): void;
      (command: "event", eventName: string): void;
      (command: "upgrade", reason: string): void;
      (command: string, ...args: unknown[]): void;
      q?: unknown[];
      v?: string;
    };
  }
}

/**
 * Safe invocation helper for Clarity commands
 */
export function clarityCommand(command: string, ...args: unknown[]) {
  if (typeof window === "undefined") return;
  const clarity = (window as unknown as Record<string, unknown>).clarity;
  if (typeof clarity === "function") {
    clarity(command, ...args);
  } else if (clarity && typeof clarity === "object" && "q" in clarity && Array.isArray((clarity as { q: unknown[] }).q)) {
    (clarity as { q: unknown[] }).q.push([command, ...args]);
  }
}

/**
 * Identify authenticated user and tag session with role and org
 */
export function identifyUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId?: string | null;
  organizationName?: string | null;
}) {
  if (typeof window === "undefined") return;

  // Identify in Clarity
  clarityCommand("identify", user.id, undefined, undefined, user.name);
  clarityCommand("set", "user_role", user.role);
  clarityCommand("set", "user_email", user.email);
  if (user.organizationId) {
    clarityCommand("set", "organization_id", user.organizationId);
  }
  if (user.organizationName) {
    clarityCommand("set", "organization_name", user.organizationName);
  }
}

/**
 * Capture pre-login or campaign query params (e.g. ?client=brandalyst&proposal=summer26)
 */
export function trackPreLoginContext(searchParams: URLSearchParams) {
  if (typeof window === "undefined") return;

  const client = searchParams.get("client") || searchParams.get("org") || searchParams.get("company");
  const pitch = searchParams.get("pitch") || searchParams.get("proposal") || searchParams.get("campaign");
  const ref = searchParams.get("ref") || searchParams.get("source");

  if (client) clarityCommand("set", "target_client", client);
  if (pitch) clarityCommand("set", "pitch_campaign", pitch);
  if (ref) clarityCommand("set", "referral_source", ref);
}

/**
 * Track DOOH specific entity interactions
 */
export function trackEntityView(entityType: "location" | "campaign" | "media_plan", data: Record<string, string | number | undefined | null>) {
  if (typeof window === "undefined") return;

  Object.entries(data).forEach(([key, val]) => {
    if (val != null) {
      clarityCommand("set", `${entityType}_${key}`, String(val));
    }
  });

  clarityCommand("event", `view_${entityType}`);
}

/**
 * Track key business events (e.g. export PDF, optimize plan, import excel)
 */
export function trackBusinessEvent(eventName: string, details?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;

  if (details) {
    Object.entries(details).forEach(([key, val]) => {
      if (val != null) {
        clarityCommand("set", `event_${key}`, String(val));
      }
    });
  }

  clarityCommand("event", eventName);
}
