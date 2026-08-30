import { createApiClient } from "@skyarc/api-client";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

let accessToken: string | null = null;
let refreshToken: string | null = null;

export async function loadTokens() {
  accessToken = await SecureStore.getItemAsync("accessToken");
  refreshToken = await SecureStore.getItemAsync("refreshToken");
}

export async function saveTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  await SecureStore.setItemAsync("accessToken", access);
  await SecureStore.setItemAsync("refreshToken", refresh);
}

export async function clearTokens() {
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync("accessToken");
  await SecureStore.deleteItemAsync("refreshToken");
}

export function getApiClient() {
  return createApiClient({
    baseUrl: API_URL,
    getAccessToken: async () => accessToken,
  });
}

export async function login(email: string, password: string) {
  const client = getApiClient();
  const result = await client.login(email, password, "Skyarc Atlas Mobile");
  await saveTokens(result.data.accessToken, result.data.refreshToken);
  return result.data.user;
}

export async function logout() {
  try {
    const client = getApiClient();
    if (refreshToken) {
      await client.logout(refreshToken);
    }
  } catch {
    // ignore logout errors — still clear local session
  }
  await clearTokens();
}

export function isAuthenticated(): boolean {
  return !!accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}
