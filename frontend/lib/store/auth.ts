/**
 * Auth Zustand store.
 *
 * Persists tokens in SecureStore and hydrates user state on app start.
 * Registers the session-expired handler so the Axios client can trigger sign-out.
 */

import { create } from "zustand";

import {
  getMe,
  login,
  signup,
  type LoginPayload,
  type SignupPayload,
  type User,
} from "@/lib/api/auth";
import {
  apiClient,
  clearTokens,
  getAccessToken,
  registerSessionExpiredHandler,
  refreshStoredTokens,
  saveTokens,
} from "@/lib/api/client";

// ── State shape ───────────────────────────────────────────────────────────────

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "offline";

interface AuthState {
  status: AuthStatus;
  user: User | null;

  // Actions
  bootstrap: () => Promise<void>;
  signIn: (payload: LoginPayload) => Promise<void>;
  signUp: (payload: SignupPayload) => Promise<User>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => {
  // Register the Axios client's session-expired hook so it can sign out
  registerSessionExpiredHandler(() => { set({ status: "unauthenticated", user: null }); });

  return {
    status: "loading",
    user: null,

    /**
     * Called once on app start.
     * If a valid access token exists, fetches /auth/me to restore the session.
     */
    bootstrap: async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          set({ status: "unauthenticated" });
          return;
        }
        const user = await getMe();
        set({ status: "authenticated", user });
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) {
          try {
            await refreshStoredTokens();
            const user = await getMe();
            set({ status: "authenticated", user });
            return;
          } catch {
            await clearTokens();
            set({ status: "unauthenticated", user: null });
            return;
          }
        }

        // Only clear tokens on a proper 401 (invalid/expired and unrefreshable token).
        // Network errors (timeout, wrong IP, backend down) should NOT
        // wipe the token — the user is still logged in, just offline.
        if (status === 403) {
          await clearTokens();
          set({ status: "unauthenticated", user: null });
        } else {
          // Network/server error — token still exists and may be valid.
          // Treat as authenticated so the user isn't bounced to sign-in.
          set({ status: "offline", user: null });
        }
      }
    },

    /**
     * Signs the user in, saves tokens, then fetches the full user profile.
     * Throws on API error so the calling hook can surface the message.
     */
    signIn: async (payload: LoginPayload) => {
      const tokens = await login(payload);
      await saveTokens(tokens.access_token, tokens.refresh_token);
      const user = await getMe();
      set({ status: "authenticated", user });
    },

    /**
     * Creates a new account. Returns the created User so the screen can
     * navigate to verify-email with the email address.
     * Does NOT sign the user in (email must be verified first).
     */
    signUp: async (payload: SignupPayload): Promise<User> => {
      const user = await signup(payload);
      return user;
    },

    /**
     * Clears tokens and resets state.
     */
    signOut: async () => {
      if (get().status === "authenticated") {
        try { await apiClient.post("/auth/logout"); } catch { /* Local sign-out still works offline. */ }
      }
      await clearTokens();
      set({ status: "unauthenticated", user: null });
    },

    setUser: (user: User) => set({ user }),
  };
});
