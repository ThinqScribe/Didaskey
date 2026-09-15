/**
 * Auth API — typed wrappers around every /auth endpoint.
 *
 * All functions throw an AxiosError on failure; callers handle the message.
 */

import { Platform } from "react-native";

import { apiClient } from "./client";

// ── Types (mirror backend schemas) ───────────────────────────────────────────

export type UserRole = "student" | "tutor" | "admin";

export type EducationLevel =
  | "primary_school"
  | "junior_secondary"
  | "senior_secondary"
  | "high_school"
  | "undergraduate"
  | "postgraduate";

export interface User {
  id: number;
  email: string;
  phone_number: string | null;
  role: UserRole;
  education_level: EducationLevel | null;
  first_name: string;
  last_name: string;
  profile_image_url: string | null;
  is_active: boolean;
  is_verified: boolean;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface SignupPayload {
  email: string;
  phone_number: string;
  password: string;
  role: UserRole;
  education_level?: EducationLevel | null;
  first_name: string;
  last_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface MessageResponse {
  message: string;
}

// ── Auth API calls ────────────────────────────────────────────────────────────

/** POST /auth/signup → returns the created User (no tokens yet, email unverified) */
export async function signup(payload: SignupPayload): Promise<User> {
  const { data } = await apiClient.post<User>("/auth/signup", payload);
  return data;
}

/** POST /auth/login → returns access + refresh tokens */
export async function login(payload: LoginPayload): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>("/auth/login", payload);
  return data;
}

/** POST /auth/refresh → returns a new token pair */
export async function refreshTokens(refresh_token: string): Promise<TokenPair> {
  const { data } = await apiClient.post<TokenPair>("/auth/refresh", { refresh_token });
  return data;
}

/** POST /auth/verify-email → confirms the JWT token from the email link */
export async function verifyEmail(token: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/verify-email", { token });
  return data;
}

/** POST /auth/resend-verification → resends the verification email */
export async function resendVerification(email: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/resend-verification", { email });
  return data;
}

/** POST /auth/forgot-password → sends a password reset email */
export async function forgotPassword(email: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/forgot-password", { email });
  return data;
}

/** POST /auth/reset-password → resets the password using the reset token */
export async function resetPassword(token: string, new_password: string): Promise<MessageResponse> {
  const { data } = await apiClient.post<MessageResponse>("/auth/reset-password", {
    token,
    new_password,
  });
  return data;
}

/** GET /auth/me → returns the currently authenticated user */
export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<User>("/auth/me");
  return data;
}

// ── Error helper ──────────────────────────────────────────────────────────────

/**
 * Extracts a human-readable message from an Axios error response.
 * Backend returns { detail: string } on errors.
 */
export function extractErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as any).response?.data?.detail === "string"
  ) {
    return (error as any).response.data.detail;
  }
  return fallback;
}

/** POST /users/me/avatar — upload a profile photo, returns updated User */
export async function uploadAvatar(imageUri: string, mimeType = "image/jpeg", file?: File): Promise<User> {
  const form = new FormData();
  if (Platform.OS === "web") {
    if (file) form.append("file", file, file.name || "avatar.jpg");
    else {
      const blob = await fetch(imageUri).then(response => response.blob());
      form.append("file", blob, "avatar.jpg");
    }
  } else {
    form.append("file", { uri: imageUri, name: "avatar.jpg", type: mimeType } as any);
  }
  const { data } = await apiClient.post<User>("/users/me/avatar", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60000,
  });
  return data;
}
