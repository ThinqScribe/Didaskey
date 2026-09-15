import { Platform } from "react-native";

import { apiClient, BASE_URL, getAccessToken } from "./client";

export type ItemKind = "message" | "resource" | "assignment" | "note";
export interface Submission { id: number; body: string; feedback: string | null; score: number | null; reviewed_at: string | null; submitted_at: string }
export interface MessageReaction { emoji: string; count: number; mine: boolean }
export interface ReplyPreview { id: number; author_id: number; author_name: string; body: string; kind: ItemKind }
export interface LearningItem { id: number; booking_id: number; author_id: number; author_name: string; kind: ItemKind; title: string; body: string; url: string | null; due_at: string | null; client_id?: string | null; created_at: string; submission: Submission | null; delivered_by_recipient?: boolean; read_by_recipient?: boolean; reply_to_item_id?: number | null; reply_to?: ReplyPreview | null; reactions?: MessageReaction[]; attachment?: { filename: string; media_type: string; size: number } | null; extra?: Record<string, unknown> | null; pending?: boolean; failed?: boolean }
export interface BoardStroke { id: number; author_id: number; client_id?: string | null; points: [number, number][]; color: string; width: number }
export interface Conversation { booking_id: number; title: string; counterpart: string; last_message: string | null; last_message_at?: string | null; scheduled_at: string; unread_count?: number; last_read_item_id?: number }
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
export async function publishItem(bookingId: number, payload: { kind: ItemKind; title?: string; body: string; url?: string; due_at?: string; client_id?: string; reply_to_item_id?: number | null }) {
  return (await apiClient.post(`/learning/bookings/${bookingId}`, payload)).data;
}
export async function submitAssignment(id: number, body: string) { await apiClient.put(`/learning/assignments/${id}/submission`, { body }); }
export async function reviewAssignment(id: number, feedback: string, score?: number) { await apiClient.put(`/learning/assignments/${id}/feedback`, { feedback, score }); }
export async function getConversations(page = 1): Promise<Conversation[]> { return (await apiClient.get("/messages", { params: { page } })).data; }
export async function getConversationMessages(bookingId: number, after = 0): Promise<LearningItem[]> {
  try {
    return (await apiClient.get<LearningItem[]>(`/messages/bookings/${bookingId}`, { params: { after, limit: 100 } })).data;
  } catch (err: any) {
    if (![404, 405].includes(err?.response?.status)) throw err;
    const { data } = await apiClient.get<LearningItem[]>(`/learning/bookings/${bookingId}`, { params: { after, limit: 100 } });
    return data.filter(item => item.kind === "message");
  }
}
export async function sendConversationMessage(bookingId: number, payload: { body: string; client_id?: string; reply_to_item_id?: number | null }): Promise<LearningItem> {
  try {
    return (await apiClient.post<LearningItem>(`/messages/bookings/${bookingId}`, payload, { timeout: 30000 })).data;
  } catch (err: any) {
    if (payload.reply_to_item_id && err?.response?.status === 422) {
      return (await apiClient.post<LearningItem>(`/messages/bookings/${bookingId}`, { body: payload.body, client_id: payload.client_id }, { timeout: 30000 })).data;
    }
    if (![404, 405].includes(err?.response?.status)) throw err;
    try {
      return (await apiClient.post<LearningItem>(`/learning/bookings/${bookingId}`, { kind: "message", ...payload }, { timeout: 30000 })).data;
    } catch (fallbackErr: any) {
      if (!payload.reply_to_item_id || fallbackErr?.response?.status !== 422) throw fallbackErr;
      return (await apiClient.post<LearningItem>(`/learning/bookings/${bookingId}`, { kind: "message", body: payload.body, client_id: payload.client_id }, { timeout: 30000 })).data;
    }
  }
}
export async function markConversationRead(bookingId: number, lastItemId: number): Promise<void> {
  try {
    await apiClient.put(`/messages/bookings/${bookingId}/read`, { last_item_id: lastItemId });
  } catch (err: any) {
    if (![404, 405].includes(err?.response?.status)) throw err;
    await apiClient.put(`/learning/bookings/${bookingId}/read`, { last_item_id: lastItemId });
  }
}
export async function markConversationDelivered(bookingId: number, lastItemId: number): Promise<void> {
  try {
    await apiClient.put(`/messages/bookings/${bookingId}/delivered`, { last_item_id: lastItemId });
  } catch (err: any) {
    if (![404, 405].includes(err?.response?.status)) throw err;
  }
}
export async function reactToMessage(bookingId: number, itemId: number, emoji: string, remove = false): Promise<LearningItem> {
  return (await apiClient.put<LearningItem>(`/messages/bookings/${bookingId}/messages/${itemId}/reaction`, { emoji, remove })).data;
}
export async function editConversationMessage(bookingId: number, itemId: number, body: string): Promise<LearningItem> {
  return (await apiClient.put<LearningItem>(`/messages/bookings/${bookingId}/messages/${itemId}`, { body })).data;
}
export async function deleteConversationMessage(bookingId: number, itemId: number): Promise<LearningItem> {
  return (await apiClient.delete<LearningItem>(`/messages/bookings/${bookingId}/messages/${itemId}`)).data;
}
export async function uploadMessageAttachment(
  bookingId: number,
  asset: { uri: string; name: string; mimeType?: string | null; file?: File },
  options: { body?: string; client_id?: string; reply_to_item_id?: number | null } = {},
): Promise<LearningItem> {
  const form = new FormData();
  if (Platform.OS === "web" && asset.file) form.append("file", asset.file, asset.name);
  else form.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob);
  if (options.body) form.append("body", options.body);
  if (options.client_id) form.append("client_id", options.client_id);
  if (options.reply_to_item_id) form.append("reply_to_item_id", String(options.reply_to_item_id));
  return (await apiClient.post<LearningItem>(`/messages/bookings/${bookingId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })).data;
}
export async function createMessageSocket(bookingId: number): Promise<WebSocket> {
  const token = await getAccessToken();
  if (!token) throw new Error("You are not signed in.");
  const wsBase = BASE_URL.replace(/^http/i, "ws");
  return new WebSocket(`${wsBase}/messages/ws/${bookingId}?token=${encodeURIComponent(token)}`);
}
export async function getWhiteboardStrokes(bookingId: number): Promise<BoardStroke[]> {
  return (await apiClient.get<BoardStroke[]>(`/learning/bookings/${bookingId}/whiteboard`)).data;
}
export async function createWhiteboardSocket(bookingId: number): Promise<WebSocket> {
  const token = await getAccessToken();
  if (!token) throw new Error("You are not signed in.");
  const wsBase = BASE_URL.replace(/^http/i, "ws");
  return new WebSocket(`${wsBase}/learning/bookings/${bookingId}/whiteboard/ws?token=${encodeURIComponent(token)}`);
}
export async function getProgress(): Promise<Progress> { return (await apiClient.get("/progress")).data; }
export async function getNotices(page = 1): Promise<Notice[]> { return (await apiClient.get("/notifications", { params: { page } })).data; }

export async function registerPushToken(payload: { token: string; platform: string; device_id?: string | null }): Promise<void> {
  await apiClient.post("/notifications/push-token", payload);
}
