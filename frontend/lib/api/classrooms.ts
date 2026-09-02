/**
 * Live video classroom API — typed wrappers around the classroom endpoints.
 *
 * A classroom exists 1:1 with an ONLINE, CONFIRMED booking. The join
 * window opens a few minutes before the scheduled start and stays open
 * until a short grace period after the scheduled end.
 *
 * The constants below mirror the backend defaults (see
 * `backend/app/core/config.py`) purely for optimistic client-side UI
 * (countdowns, enabling the "Join Session" button early). The backend is
 * always the source of truth and re-validates the window on every
 * `/join` call — so a stale client-side clock can never let someone in
 * (or lock them out) when the server disagrees.
 */

import { apiClient } from "./client";

// ── Constants (mirror backend settings) ──────────────────────────────────────

export const CLASSROOM_JOIN_BEFORE_MINUTES = 10;
export const CLASSROOM_JOIN_GRACE_MINUTES = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClassroomStatus = "scheduled" | "live" | "ended";

export interface ClassroomWindow {
  opens_at: string;
  closes_at: string;
  can_join_now: boolean;
  seconds_until_open: number;
}

export interface ClassroomResponse {
  booking_id: number;
  room_name: string;
  status: ClassroomStatus;
  session_format: string;
  started_at: string | null;
  ended_at: string | null;
  window: ClassroomWindow;
}

export interface ClassroomJoinResponse {
  booking_id: number;
  room_name: string;
  livekit_url: string;
  token: string;
  identity: string;
  display_name: string;
  role: "student" | "tutor" | "admin";
  expires_in_minutes: number;
}

// ── API calls ──────────────────────────────────────────────────────────────────

/** GET /classrooms/bookings/:id — join-window + status. Safe to poll. */
export async function getClassroomStatus(bookingId: number): Promise<ClassroomResponse> {
  const { data } = await apiClient.get<ClassroomResponse>(
    `/classrooms/bookings/${bookingId}`
  );
  return data;
}

/**
 * POST /classrooms/bookings/:id/join
 *
 * Issues a short-lived LiveKit access token. The backend re-validates
 * ownership, booking status, and the join window before issuing it.
 */
export async function joinClassroom(bookingId: number): Promise<ClassroomJoinResponse> {
  const { data } = await apiClient.post<ClassroomJoinResponse>(
    `/classrooms/bookings/${bookingId}/join`
  );
  return data;
}

/** POST /classrooms/bookings/:id/leave — record that the caller left. */
export async function leaveClassroom(bookingId: number): Promise<void> {
  await apiClient.post(`/classrooms/bookings/${bookingId}/leave`);
}

/**
 * POST /classrooms/bookings/:id/end — tutor/admin ends the session.
 *
 * Force-disconnects any remaining participants and marks the booking
 * `completed`.
 */
export async function endClassroom(bookingId: number): Promise<ClassroomResponse> {
  const { data } = await apiClient.post<ClassroomResponse>(
    `/classrooms/bookings/${bookingId}/end`
  );
  return data;
}

// ── Client-side join-window helper (optimistic UI only) ──────────────────────

export interface JoinWindowInfo {
  opensAt: Date;
  closesAt: Date;
  canJoinNow: boolean;
  isPast: boolean;
  secondsUntilOpen: number;
}

/**
 * Mirrors `classroom_service.compute_window()` for instant UI feedback —
 * e.g. deciding whether to render a "Join Session" button vs. a
 * countdown label without a network round-trip.
 */
export function getJoinWindow(
  scheduledAt: string,
  durationMinutes: number
): JoinWindowInfo {
  const start = new Date(scheduledAt);
  const opensAt = new Date(start.getTime() - CLASSROOM_JOIN_BEFORE_MINUTES * 60_000);
  const closesAt = new Date(
    start.getTime() + (durationMinutes + CLASSROOM_JOIN_GRACE_MINUTES) * 60_000
  );
  const now = new Date();

  return {
    opensAt,
    closesAt,
    canJoinNow: now >= opensAt && now <= closesAt,
    isPast: now > closesAt,
    secondsUntilOpen: Math.max(0, Math.round((opensAt.getTime() - now.getTime()) / 1000)),
  };
}

/** Human-friendly "Starts in 2h 15m" / "Join now" / "Session ended" label. */
export function joinCountdownLabel(window: JoinWindowInfo): string {
  if (window.canJoinNow) return "Join now";
  if (window.isPast) return "Session ended";

  const totalMinutes = Math.ceil(window.secondsUntilOpen / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}
