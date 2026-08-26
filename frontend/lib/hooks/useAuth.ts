/**
 * useAuth hook
 *
 * Thin layer over the auth store + API that:
 * - manages per-action loading and error state
 * - handles navigation side-effects
 * - exposes clean, typed action functions to screens
 */

import { useState } from "react";
import { router } from "expo-router";

import { extractErrorMessage, forgotPassword, resendVerification } from "@/lib/api/auth";
import type { LoginPayload, SignupPayload } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/store/auth";

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  const { signIn, signUp, signOut, user, status } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearError() {
    setError(null);
  }

  // ── Sign in ─────────────────────────────────────────────────────────────────

  async function handleSignIn(payload: LoginPayload): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      await signIn(payload);
      const role = useAuthStore.getState().user?.role;
      if (role === "tutor") {
        router.replace("/(tutor)/dashboard");
      } else {
        router.replace("/(tabs)/home");
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Sign in failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  // ── Sign up ─────────────────────────────────────────────────────────────────

  async function handleSignUp(payload: SignupPayload): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const user = await signUp(payload);
      router.push({
        pathname: "/(auth)/verify-email",
        params: { email: user.email },
      });
    } catch (err) {
      setError(extractErrorMessage(err, "Sign up failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  // ── Resend verification ─────────────────────────────────────────────────────

  async function handleResendVerification(email: string): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      await resendVerification(email);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not resend email. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  // ── Forgot password ─────────────────────────────────────────────────────────

  async function handleForgotPassword(email: string): Promise<boolean> {
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      return true;
    } catch (err) {
      setError(extractErrorMessage(err, "Could not send reset email. Please try again."));
      return false;
    } finally {
      setLoading(false);
    }
  }

  // ── Sign out ────────────────────────────────────────────────────────────────

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.replace("/(auth)/sign-in");
  }

  return {
    user,
    status,
    loading,
    error,
    clearError,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    resendVerification: handleResendVerification,
    forgotPassword: handleForgotPassword,
  };
}
