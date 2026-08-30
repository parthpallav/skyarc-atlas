import { createApiClient } from "@skyarc/api-client";
import { UserRole, type UserRole as UserRoleType } from "@skyarc/shared";

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:3001";
    }
    // In production (e.g. atlas.skyarcads.com or Vercel preview), use same-origin relative path
    // which Next.js rewrites to the VPS backend over HTTP without triggering browser Mixed Content blocks.
    return "";
  }
  return "http://localhost:3001";
}

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: UserRoleType;
  organizationId: string | null;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

export function storeTokens(access: string, refresh: string) {
  localStorage.setItem("accessToken", access);
  localStorage.setItem("refreshToken", refresh);
}

export function storeUser(user: StoredUser) {
  localStorage.setItem("user", JSON.stringify(user));
}

function parseRole(role: string | undefined): UserRoleType {
  const values = Object.values(UserRole) as string[];
  if (role && values.includes(role)) {
    return role as UserRoleType;
  }
  return UserRole.VIEWER;
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000 - 10000; // 10s buffer
  } catch {
    return true;
  }
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredUser;
      return {
        ...parsed,
        role: parseRole(parsed.role),
        organizationId: parsed.organizationId ?? null,
      };
    } catch {
      /* fall through */
    }
  }
  const token = getStoredToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as {
      id?: string;
      email?: string;
      name?: string;
      role?: string;
      organizationId?: string | null;
    };
    if (!payload.email) return null;
    return {
      id: payload.id ?? "",
      email: payload.email,
      name: payload.name ?? payload.email.split("@")[0] ?? "User",
      role: parseRole(payload.role),
      organizationId: payload.organizationId ?? null,
    };
  } catch {
    return null;
  }
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
}

export function createWebApiClient() {
  return createApiClient({
    baseUrl: getApiBaseUrl(),
    getAccessToken: () => getStoredToken(),
    getRefreshToken: () => getStoredRefreshToken(),
    onTokenRefreshed: (tokens) => {
      storeTokens(tokens.accessToken, tokens.refreshToken);
    },
    onUnauthorized: () => {
      clearTokens();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
    },
  });
}

/** Fetches every location page (API max limit is 100 per request). */
export async function listAllLocations<T = unknown>(): Promise<T[]> {
  const client = createWebApiClient();
  const all: T[] = [];
  const limit = 100;
  let page = 1;

  while (true) {
    const result = await client.listLocations(page, limit);
    const batch = result.data as T[];
    all.push(...batch);

    const total = Number((result.meta as { total?: number }).total ?? batch.length);
    if (all.length >= total || batch.length < limit) break;
    page += 1;
  }

  return all;
}
