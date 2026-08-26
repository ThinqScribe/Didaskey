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

// ── Constants ────────────────────────────────────────────────────────────────

export const BASE_URL = "http://172.20.10.4:8000/api/v1";

export const TOKEN_KEYS = {
  ACCESS: "didaskey_access_token",
  REFRESH: "didaskey_refresh_token",
} as const;

// ── Token helpers ─────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEYS.ACCESS);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEYS.REFRESH);
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEYS.ACCESS, access),
    SecureStore.setItemAsync(TOKEN_KEYS.REFRESH, refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
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
  let isRefreshing = false;
  let refreshQueue: Array<(token: string) => void> = [];

  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      if (error.response?.status !== 401 || original._retry) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue subsequent 401s until the refresh resolves
        return new Promise((resolve) => {
          refreshQueue.push((newToken) => {
            original.headers.Authorization = `Bearer ${newToken}`;
            resolve(instance(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) throw new Error("No refresh token");

        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        await saveTokens(data.access_token, data.refresh_token);

        refreshQueue.forEach((cb) => cb(data.access_token));
        refreshQueue = [];

        original.headers.Authorization = `Bearer ${data.access_token}`;
        return instance(original);
      } catch {
        refreshQueue = [];
        await clearTokens();
        // Signal to the auth store that the session has expired
        // (the store listens for this event via the onSessionExpired callback)
        onSessionExpiredCallback?.();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
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
