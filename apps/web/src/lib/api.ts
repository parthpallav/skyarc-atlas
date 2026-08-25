import { createApiClient } from "@skyarc/api-client";

// Empty string = same-origin (Vercel rewrites proxy to VPS API over HTTPS).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function storeTokens(access: string, refresh: string) {
  localStorage.setItem("accessToken", access);
  localStorage.setItem("refreshToken", refresh);
}

export function storeUser(user: StoredUser) {
  localStorage.setItem("user", JSON.stringify(user));
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  if (raw) {
    try {
      return JSON.parse(raw) as StoredUser;
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
    };
    if (!payload.email) return null;
    return {
      id: payload.id ?? "",
      email: payload.email,
      name: payload.name ?? payload.email.split("@")[0] ?? "User",
      role: payload.role ?? "USER",
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
    baseUrl: API_URL,
    getAccessToken: () => getStoredToken(),
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
