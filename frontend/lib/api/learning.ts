import { apiClient } from "./client";

export type ItemKind = "message" | "resource" | "assignment" | "note";
export interface Submission { id: number; body: string; feedback: string | null; score: number | null; reviewed_at: string | null; submitted_at: string }
export interface LearningItem { id: number; booking_id: number; author_id: number; author_name: string; kind: ItemKind; title: string; body: string; url: string | null; due_at: string | null; created_at: string; submission: Submission | null; read_by_recipient?: boolean; attachment?: { filename: string; media_type: string; size: number } | null }
export interface Conversation { booking_id: number; title: string; counterpart: string; last_message: string | null; scheduled_at: string }
export interface Notice { id: number; title: string; body: string; read_at: string | null; booking_id: number | null; created_at: string }
export interface Progress { completed_sessions: number; learning_minutes: number; assignments: number; submitted: number; reviewed: number; pending: number }

export async function getLearningItems(bookingId: number): Promise<LearningItem[]> {
  const all: LearningItem[] = [];
  let after = 0;
  for (;;) {
    const { data } = await apiClient.get<LearningItem[]>(`/learning/bookings/${bookingId}`, { params: { after, limit: 100 } });
    all.push(...data);
    if (data.length < 100) return all;
    after = data[data.length - 1].id;
  }
}
export async function publishItem(bookingId: number, payload: { kind: ItemKind; title?: string; body: string; url?: string; due_at?: string; client_id?: string }) {
  return (await apiClient.post(`/learning/bookings/${bookingId}`, payload)).data;
}
export async function submitAssignment(id: number, body: string) { await apiClient.put(`/learning/assignments/${id}/submission`, { body }); }
export async function reviewAssignment(id: number, feedback: string, score?: number) { await apiClient.put(`/learning/assignments/${id}/feedback`, { feedback, score }); }
export async function getConversations(page = 1): Promise<Conversation[]> { return (await apiClient.get("/messages", { params: { page } })).data; }
export async function getProgress(): Promise<Progress> { return (await apiClient.get("/progress")).data; }
export async function getNotices(page = 1): Promise<Notice[]> { return (await apiClient.get("/notifications", { params: { page } })).data; }
