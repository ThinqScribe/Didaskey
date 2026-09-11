import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { getConversations, getProgress, type Conversation, type Progress } from "@/lib/api/learning";
import { extractErrorMessage } from "@/lib/api/auth";
import { EmptyState, Metric, SectionHeading } from "@/components/ui/AppChrome";
import { Colors } from "@/constants";

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
    {progress && <View style={ui.row}><Metric icon="checkmark-done-outline" value={String(progress.completed_sessions)} label="Lessons done" /><Metric icon="time-outline" value={`${Math.round(progress.learning_minutes / 6) / 10}h`} label="Learning time" tint={Colors.paleBlue} /><Metric icon="create-outline" value={String(progress.pending)} label="Practice due" tint={Colors.paleGold} /><Metric icon="ribbon-outline" value={String(progress.reviewed)} label="Reviewed" /></View>}
    <SectionHeading title="Your lesson spaces" />
    {sessions.map(s => <Card key={s.booking_id}><Text style={ui.heading}>{s.title}</Text><Text style={ui.muted}>With {s.counterpart} · {new Date(s.scheduled_at).toLocaleDateString()}</Text><Text style={ui.text} numberOfLines={2}>{s.last_message ?? "Your lesson materials and conversation live here."}</Text><Action label="Open learning space" onPress={() => router.push(`/learning/${s.booking_id}`)} /></Card>)}
    {!busy && !error && !sessions.length && <EmptyState icon="book-outline" title="Your next chapter starts with a lesson" body="Confirmed sessions appear here with messages, practice, notes, and materials." />}
    {(busy || more) && <Action label="Load more sessions" busy={busy} onPress={() => load(page + 1)} secondary />}
  </Page>;
}
