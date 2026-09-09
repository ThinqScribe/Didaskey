import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { getConversations, getProgress, type Conversation, type Progress } from "@/lib/api/learning";
import { extractErrorMessage } from "@/lib/api/auth";

export default function LearningHome() {
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (next = 1) => {
    setBusy(true);
    try { const [rows, p] = await Promise.all([getConversations(next), getProgress()]); setSessions(old => next === 1 ? rows : [...old, ...rows]); setProgress(p); setPage(next); setMore(rows.length === 50); setError(""); }
    catch (e) { setError(extractErrorMessage(e, "Could not load your learning space.")); }
    finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <Page title="Keep learning" subtitle="Small steps. Steady progress. Everything from your lessons, together.">
    <ErrorNotice message={error} retry={() => load()} />
    {progress && <Card><Text style={ui.heading}>Your learning so far</Text><View style={ui.row}>{[[progress.completed_sessions, "sessions completed"], [Math.round(progress.learning_minutes / 60 * 10) / 10, "hours of lessons"], [progress.pending, "assignments to do"], [progress.reviewed, "assignments reviewed"]].map(([value, label]) => <View key={label} style={{ minWidth: 130, flex: 1, gap: 4 }}><Text style={ui.title}>{value}</Text><Text style={ui.muted}>{label}</Text></View>)}</View></Card>}
    <Text style={ui.heading}>Your sessions</Text>
    {sessions.map(s => <Card key={s.booking_id}><Text style={ui.heading}>{s.title}</Text><Text style={ui.muted}>With {s.counterpart} · {new Date(s.scheduled_at).toLocaleDateString()}</Text><Text style={ui.text} numberOfLines={2}>{s.last_message ?? "Your lesson materials and conversation live here."}</Text><Action label="Open learning space" onPress={() => router.push(`/learning/${s.booking_id}`)} /></Card>)}
    {!busy && !error && !sessions.length && <Card><Text style={ui.heading}>Your next chapter starts with a lesson</Text><Text style={ui.text}>Confirmed sessions appear here with messages, assignments, and learning materials.</Text></Card>}
    {(busy || more) && <Action label="Load more sessions" busy={busy} onPress={() => load(page + 1)} secondary />}
  </Page>;
}
