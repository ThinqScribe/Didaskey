import { useCallback, useState } from "react";
import { Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { getNotices, type Notice } from "@/lib/api/learning";
import { apiClient } from "@/lib/api/client";

export default function Notifications() {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (next = 1) => { setBusy(true); try { const rows = await getNotices(next); setItems(old => next === 1 ? rows : [...old, ...rows]); setPage(next); setMore(rows.length === 50); setError(""); } catch { setError("Could not load notifications."); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function open(item: Notice) { try { await apiClient.put(`/notifications/${item.id}/read`); if (item.booking_id) router.push(`/learning/${item.booking_id}`); else await load(); } catch { setError("Could not open this notification. Please retry."); } }
  return <Page title="Notifications" subtitle="Lesson updates, messages, and feedback.">
    <ErrorNotice message={error} retry={() => load()} />
    {items.some(i => !i.read_at) && <Action label="Mark all as read" secondary onPress={async () => { try { await apiClient.put("/notifications/read-all"); await load(); } catch { setError("Could not update notifications."); } }} />}
    {items.map(item => <Card key={item.id}><Text style={ui.muted}>{item.read_at ? "Read" : "New"} · {new Date(item.created_at).toLocaleString()}</Text><Text style={ui.heading}>{item.title}</Text><Text style={ui.text}>{item.body}</Text><Action label="View update" secondary onPress={() => open(item)} /></Card>)}
    {!busy && !error && !items.length && <Card><Text style={ui.heading}>You’re all caught up</Text><Text style={ui.text}>New lesson activity will appear here.</Text></Card>}
    {(busy || more) && <Action label="Load more" busy={busy} secondary onPress={() => load(page + 1)} />}
  </Page>;
}
