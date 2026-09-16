/**
 * Bookings API — typed wrappers around the booking and payment endpoints.
 *
 * Security notes
 * --------------
 * - No price or amount field is ever sent by the client — the backend
 *   derives the amount from the tutor's rate and the requested duration.
 * - scheduled_at must be an ISO 8601 string with a UTC offset (+00:00).
 *   Sending a naive datetime will be rejected by the backend validator.
 * - The Paystack access_code returned by createBooking is short-lived and
 *   should be used immediately to launch the payment sheet.
 */

import { apiClient } from "./client";

// ── Enums (mirror backend BookingStatus / SessionFormat) ─────────────────────

export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type SessionFormat = "online" | "in_person";

export type TransactionStatus = "pending" | "success" | "failed" | "refunded";

// ── Response types ─────────────────────────────────────────────────────────────

export interface TransactionSummary {
  id: number;
  paystack_reference: string;
  status: TransactionStatus;
  amount: string;
  currency: string;
  paid_at: string | null;
}

export interface BookingResponse {
  id: number;
  student_id: number;
  student_name: string | null;
  tutor_id: number;
  tutor_name: string;
  subject_id: number | null;
  subject_name: string | null;
  scheduled_at: string;        // ISO 8601 UTC string
  duration_minutes: number;
  session_format: SessionFormat;
  student_note: string | null;
  amount: string;              // Decimal as string, e.g. "35.00"
  currency: string;
  status: BookingStatus;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  transaction: TransactionSummary | null;
}

/** Returned only from POST /bookings — includes the Paystack access_code */
export interface BookingWithPaystack extends BookingResponse {
  paystack_access_code: string;
  paystack_reference: string;
  authorization_url: string;
}

export interface PaginatedBookings {
  items: BookingResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── Request types ──────────────────────────────────────────────────────────────

export interface CreateBookingPayload {
  tutor_id: number;
  subject_id?: number | null;
  /** ISO 8601 with timezone offset, e.g. "2024-05-20T14:00:00+00:00" */
  scheduled_at: string;
  /** Minutes. Min 30, max 480. Default 60. */
  duration_minutes: number;
  session_format: SessionFormat;
  /** Optional message to the tutor (max 500 chars) */
  student_note?: string | null;
}

export interface CancelBookingPayload {
  reason?: string | null;
}

export interface ListBookingsParams {
  status?: BookingStatus;
  page?: number;
  page_size?: number;
}

// ── API calls ──────────────────────────────────────────────────────────────────

/**
 * POST /bookings
 *
 * Creates a booking and immediately initiates a Paystack transaction.
 * Returns the booking details plus a short-lived `paystack_access_code`
 * to pass to the Paystack SDK for payment.
 *
 * Amount is computed server-side — never pass a price in this payload.
 */
export async function createBooking(
  payload: CreateBookingPayload
): Promise<BookingWithPaystack> {
  const { data } = await apiClient.post<BookingWithPaystack>("/bookings", payload);
  return data;
}

/**
 * GET /bookings
 *
 * Returns the authenticated student's own bookings, paginated.
 * Optionally filter by status.
 */
export async function listBookings(
  params?: ListBookingsParams
): Promise<PaginatedBookings> {
  const { data } = await apiClient.get<PaginatedBookings>("/bookings", {
    params,
  });
  return data;
}

/**
 * GET /bookings/:id
 *
 * Returns a single booking. Only accessible to the owning student or admin.
 */
export async function getBooking(bookingId: number): Promise<BookingResponse> {
  const { data } = await apiClient.get<BookingResponse>(`/bookings/${bookingId}`);
  return data;
}

/**
 * PATCH /bookings/:id/cancel
 *
 * Students may cancel up to 24 hours before the session.
 * Returns the updated booking.
 */
export async function cancelBooking(
  bookingId: number,
  payload?: CancelBookingPayload
): Promise<BookingResponse> {
  const { data } = await apiClient.patch<BookingResponse>(
    `/bookings/${bookingId}/cancel`,
    payload ?? {}
  );
  return data;
}

export interface PaymentInitiateResponse {
  booking_id: number;
  access_code: string;
  reference: string;
  amount: string;
  currency: string;
  authorization_url: string | null;
}

/** Start or resume Paystack payment for a pending booking. */
export async function initiatePayment(
  bookingId: number
): Promise<PaymentInitiateResponse> {
  const { data } = await apiClient.post<PaymentInitiateResponse>(
    "/payments/initiate",
    { booking_id: bookingId }
  );
  return data;
}

/** Server-side Paystack verification fallback after checkout redirects. */
export async function verifyBookingPayment(
  bookingId: number
): Promise<BookingResponse> {
  const { data } = await apiClient.post<BookingResponse>(
    `/payments/bookings/${bookingId}/verify`
  );
  return data;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Format a BookingResponse.scheduled_at string into a human-readable date.
 * e.g. "May 20, 2024"
 */
export function formatBookingDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    timeZone: "Africa/Lagos",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a BookingResponse.scheduled_at string into a time range string.
 * e.g. "4:00 PM – 5:00 PM"
 */
export function formatBookingTimeRange(
  isoString: string,
  durationMinutes: number
): string {
  const start = new Date(isoString);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      minute: "2-digit",
    });

  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Convert a Date + time string ("HH:MM:SS") into a UTC ISO 8601 string
 * suitable for the backend's scheduled_at field.
 *
 * The time string comes from the tutor's availability slot.
 */
export function buildScheduledAt(date: Date, timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString(); // always UTC with "Z" suffix = +00:00
}

/**
 * Return a human-readable label for a session format.
 */
export function sessionFormatLabel(format: SessionFormat): string {
  return format === "online" ? "1-on-1 Online" : "In-Person";
}

/**
 * Compute the total amount for display given a rate string and duration.
 * This mirrors the backend computation: rate × (duration / 60).
 * Used only for display — the authoritative amount comes from the backend.
 */
export function estimateAmount(
  ratePerHour: string,
  durationMinutes: number
): number {
  const rate = parseFloat(ratePerHour);
  return parseFloat((rate * (durationMinutes / 60)).toFixed(2));
}

/** Format a monetary amount using the currency supplied by the API. */
export function formatCurrency(
  amount: number | string,
  currency = "NGN",
  maximumFractionDigits = 2,
): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(typeof amount === "number" ? amount : parseFloat(amount));
}
