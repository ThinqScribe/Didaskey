import { apiClient } from "./client";
import type { BookingResponse, BookingStatus, PaginatedBookings } from "./bookings";
import type { TutorDetail } from "./tutors";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TutorStats {
  total_sessions: number;
  completed_sessions: number;
  pending_sessions: number;
  total_earnings: string;
  currency: string;
  average_rating: string;
  review_count: number;
  total_hours_taught: number;
}

export async function getTutorStats(): Promise<TutorStats> { return (await apiClient.get("/tutors/me/stats")).data; }

export interface SetAvailabilityPayload {
  slots: { day_of_week: string; start_time: string; end_time: string }[];
}

export interface UpdateProfilePayload {
  display_name?: string;
  bio?: string;
  qualifications?: string;
  years_of_experience?: number;
  teaching_mode?: "online" | "in_person" | "both";
  location_city?: string;
  location_state?: string;
  rate_per_hour?: number;
}

// ── My profile ────────────────────────────────────────────────────────────────

/** GET /tutors/me — own profile for the authenticated tutor */
export async function getMyTutorProfile(): Promise<TutorDetail> {
  const { data } = await apiClient.get<TutorDetail>("/tutors/me");
  return data;
}

/** PATCH /tutors/me — update own profile */
export async function updateMyProfile(payload: UpdateProfilePayload): Promise<TutorDetail> {
  const { data } = await apiClient.patch<TutorDetail>("/tutors/me", payload);
  return data;
}

/** PUT /tutors/me/availability — replace all availability slots */
export async function setAvailability(payload: SetAvailabilityPayload): Promise<TutorDetail> {
  const { data } = await apiClient.put<TutorDetail>("/tutors/me/availability", payload);
  return data;
}

// ── Bookings (tutor view) ─────────────────────────────────────────────────────

/** GET /bookings?tutor_id=:id — list this tutor's bookings */
export async function listTutorBookings(
  tutorId: number,
  params?: { status?: BookingStatus; page?: number; page_size?: number }
): Promise<PaginatedBookings> {
  const { data } = await apiClient.get<PaginatedBookings>("/bookings", {
    params: { tutor_id: tutorId, ...params },
  });
  return data;
}

// ── Stats (derived client-side from bookings) ─────────────────────────────────

export function computeStats(bookings: BookingResponse[], profile: TutorDetail): TutorStats {
  const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
  const pending   = bookings.filter((b) => b.status === "pending_payment");
  const earnings  = bookings
    .filter((b) => b.status === "completed")
    .reduce((sum, b) => sum + parseFloat(b.amount), 0);

  return {
    total_sessions:       bookings.length,
    completed_sessions:   bookings.filter((b) => b.status === "completed").length,
    pending_sessions:     pending.length,
    total_earnings:       earnings.toFixed(2),
    currency:             profile.currency,
    average_rating:       profile.average_rating,
    review_count:         profile.review_count,
    total_hours_taught:   profile.total_hours_taught,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const DAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;

export type DayOfWeek = (typeof DAYS)[number];

export function dayLabel(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}
