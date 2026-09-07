/**
 * Classroom API — typed wrappers around the classroom endpoints.
 *
 * The classroom is a LiveKit-backed learning room tied 1:1 to an ONLINE,
 * CONFIRMED booking.  The join window opens CLASSROOM_JOIN_BEFORE_MINUTES
 * before the scheduled start and stays open for CLASSROOM_JOIN_GRACE_MINUTES
 * after the scheduled end.
 *
 * The constants below mirror backend defaults (app/core/config.py) purely
 * for optimistic client-side UI — countdowns, enabling the "Join" button.
 * The backend is always the source of truth and re-validates on every /join.
 */

import { apiClient } from "./client";

// ── Constants (mirror backend settings) ──────────────────────────────────────

export const CLASSROOM_JOIN_BEFORE_MINUTES = 10;
export const CLASSROOM_JOIN_GRACE_MINUTES  = 30;

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

/** Returned by POST /join — the client uses these to connect to LiveKit. */
export interface ClassroomJoinResponse {
  booking_id: number;
  /** LiveKit WebSocket URL, e.g. wss://my-project.livekit.cloud */
  livekit_url: string;
  /** Short-lived LiveKit participant access token. */
  token: string;
  room_name: string;
  user_id: number;
  display_name: string;
  role: string;
  is_tutor: boolean;
}

export interface AttendanceSummary {
  user_id: number;
  display_name: string;
  role: string;
  total_seconds: number;
  joined_at: string | null;
  left_at: string | null;
}

// ── API calls ──────────────────────────────────────────────────────────────────

/** GET /classrooms/bookings/:id — join-window + status. Safe to poll. */
export async function getClassroomStatus(
  bookingId: number,
): Promise<ClassroomResponse> {
  const { data } = await apiClient.get<ClassroomResponse>(
    `/classrooms/bookings/${bookingId}`,
  );
  return data;
}

/**
 * POST /classrooms/bookings/:id/join
 *
 * Returns a LiveKit URL + access token.  The backend re-validates
 * ownership, booking status, and the join window before issuing.
 */
export async function joinClassroom(
  bookingId: number,
): Promise<ClassroomJoinResponse> {
  const { data } = await apiClient.post<ClassroomJoinResponse>(
    `/classrooms/bookings/${bookingId}/join`,
  );
  return data;
}

/** POST /classrooms/bookings/:id/leave — record attendance leave event. */
export async function leaveClassroom(bookingId: number): Promise<void> {
  await apiClient.post(`/classrooms/bookings/${bookingId}/leave`);
}

/** POST /classrooms/bookings/:id/end — tutor/admin ends the session. */
export async function endClassroom(
  bookingId: number,
): Promise<ClassroomResponse> {
  const { data } = await apiClient.post<ClassroomResponse>(
    `/classrooms/bookings/${bookingId}/end`,
  );
  return data;
}

/** GET /classrooms/bookings/:id/attendance */
export async function getAttendance(
  bookingId: number,
): Promise<AttendanceSummary[]> {
  const { data } = await apiClient.get<AttendanceSummary[]>(
    `/classrooms/bookings/${bookingId}/attendance`,
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
 * Mirrors classroom_service.compute_window() for instant UI feedback
 * without a network round-trip.
 */
export function getJoinWindow(
  scheduledAt: string,
  durationMinutes: number,
): JoinWindowInfo {
  const start    = new Date(scheduledAt);
  const opensAt  = new Date(start.getTime() - CLASSROOM_JOIN_BEFORE_MINUTES * 60_000);
  const closesAt = new Date(
    start.getTime() + (durationMinutes + CLASSROOM_JOIN_GRACE_MINUTES) * 60_000,
  );
  const now = new Date();

  return {
    opensAt,
    closesAt,
    canJoinNow: now >= opensAt && now <= closesAt,
    isPast: now > closesAt,
    secondsUntilOpen: Math.max(
      0,
      Math.round((opensAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

/** Human-friendly countdown label for the Join button. */
export function joinCountdownLabel(window: JoinWindowInfo): string {
  if (window.canJoinNow) return "Join now";
  if (window.isPast)     return "Session ended";

  const totalMinutes = Math.ceil(window.secondsUntilOpen / 60);
  const hours   = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}
