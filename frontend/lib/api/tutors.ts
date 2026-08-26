/**
 * Tutors API — typed wrappers around the tutor marketplace endpoints.
 */

import { apiClient } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TeachingMode = "online" | "in_person" | "both";
export type VerificationStatus = "pending" | "verified" | "rejected";

export interface Subject {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon_name: string | null;
  is_active: boolean;
}

export interface TutorSummary {
  id: number;
  display_name: string;
  profile_image_url: string | null;
  teaching_mode: TeachingMode;
  location_city: string | null;
  location_state: string | null;
  rate_per_hour: string;
  currency: string;
  average_rating: string;
  review_count: number;
  total_hours_taught: number;
  verification_status: VerificationStatus;
  subjects: Subject[];
}

export interface TutorSubjectItem {
  subject_id: number;
  subject: Subject;
  rate_override: string | null;
}

export interface AvailabilitySlot {
  id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

export interface TutorDetail extends TutorSummary {
  user_id: number;
  bio: string | null;
  qualifications: string | null;
  years_of_experience: number;
  is_active: boolean;
  tutor_subjects: TutorSubjectItem[];
  availability_slots: AvailabilitySlot[];
}

export interface Review {
  id: number;
  tutor_id: number;
  student_id: number;
  rating: number;
  comment: string | null;
  is_visible: boolean;
  created_at: string;
  student_name: string;
}

export interface PaginatedTutors {
  items: TutorSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PaginatedReviews {
  items: Review[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TutorSearchParams {
  subject_id?: number;
  teaching_mode?: TeachingMode;
  min_rating?: number;
  max_rate?: number;
  city?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** GET /tutors/subjects — active subject catalogue */
export async function getSubjects(): Promise<Subject[]> {
  const { data } = await apiClient.get<Subject[]>("/tutors/subjects");
  return data;
}

/** GET /tutors — paginated tutor discovery with optional filters */
export async function searchTutors(params?: TutorSearchParams): Promise<PaginatedTutors> {
  const { data } = await apiClient.get<PaginatedTutors>("/tutors", { params });
  return data;
}

/** GET /tutors/:id — full tutor profile */
export async function getTutor(tutorId: number): Promise<TutorDetail> {
  const { data } = await apiClient.get<TutorDetail>(`/tutors/${tutorId}`);
  return data;
}

/** GET /tutors/:id/reviews — paginated visible reviews */
export async function getTutorReviews(
  tutorId: number,
  page = 1,
  pageSize = 10
): Promise<PaginatedReviews> {
  const { data } = await apiClient.get<PaginatedReviews>(`/tutors/${tutorId}/reviews`, {
    params: { page, page_size: pageSize },
  });
  return data;
}

/** POST /tutors/:id/reviews — submit a review */
export async function submitReview(
  tutorId: number,
  rating: number,
  comment?: string
): Promise<Review> {
  const { data } = await apiClient.post<Review>(`/tutors/${tutorId}/reviews`, {
    tutor_id: tutorId,
    rating,
    comment: comment ?? null,
  });
  return data;
}
