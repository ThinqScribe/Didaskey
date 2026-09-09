/**
 * Base Axios client.
 *
 * - Injects the access token on every request.
 * - On 401, attempts a silent token refresh once, then signs the user out.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export const BASE_URL = `${API_BASE}/api/v1`;
export const SERVER_URL = API_BASE; // Without /api/v1 suffix, for classroom.html

export const TOKEN_KEYS = {
  ACCESS: "didaskey_access_token",
  REFRESH: "didaskey_refresh_token",
} as const;

// ── Token helpers ─────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return readToken(TOKEN_KEYS.ACCESS);
}

export async function getRefreshToken(): Promise<string | null> {
  return readToken(TOKEN_KEYS.REFRESH);
}

async function readToken(key: string): Promise<string | null> {
  if (Platform.OS === "web") return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  if (Platform.OS === "web") { sessionStorage.setItem(TOKEN_KEYS.ACCESS, access); sessionStorage.setItem(TOKEN_KEYS.REFRESH, refresh); return; }
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEYS.ACCESS, access),
    SecureStore.setItemAsync(TOKEN_KEYS.REFRESH, refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  if (Platform.OS === "web") { if (typeof sessionStorage !== "undefined") { sessionStorage.removeItem(TOKEN_KEYS.ACCESS); sessionStorage.removeItem(TOKEN_KEYS.REFRESH); } return; }
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEYS.ACCESS),
    SecureStore.deleteItemAsync(TOKEN_KEYS.REFRESH),
  ]);
}

// ── Client factory ────────────────────────────────────────────────────────────

function createClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: BASE_URL,
    headers: { "Content-Type": "application/json" },
    timeout: 8_000,
  });

  // Request: attach access token
  instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response: silent refresh on 401
  let refreshPromise: Promise<string> | null = null;

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      if (!original || error.response?.status !== 401 || original._retry || ["/auth/login", "/auth/refresh", "/auth/signup"].includes(original.url ?? "")) {
        return Promise.reject(error);
      }

      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = (async () => {
            const refreshToken = await getRefreshToken();
            if (!refreshToken) { await clearTokens(); onSessionExpiredCallback?.(); throw error; }
            try {
              const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 8000 });
              await saveTokens(data.access_token, data.refresh_token);
              return data.access_token as string;
            } catch (refreshError) {
              if (axios.isAxiosError(refreshError) && [401, 403].includes(refreshError.response?.status ?? 0)) { await clearTokens(); onSessionExpiredCallback?.(); }
              throw refreshError;
            }
          })().finally(() => { refreshPromise = null; });
        }
        const token = await refreshPromise;
        original.headers.Authorization = `Bearer ${token}`;
        return instance(original);
      } catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }
  );

  return instance;
}

// ── Session-expired callback ──────────────────────────────────────────────────
// The auth store registers this so it can sign out when the refresh fails.

let onSessionExpiredCallback: (() => void) | null = null;

export function registerSessionExpiredHandler(cb: () => void): void {
  onSessionExpiredCallback = cb;
}

// ── Singleton client ──────────────────────────────────────────────────────────

export const apiClient = createClient();
