import { useCallback, useState } from "react";
import { Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { apiClient } from "@/lib/api/client";

interface Student { id: number; name: string; sessions: number; last_session: string }
export default function TutorStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (next = 1) => {
    setBusy(true);
    try { const { data } = await apiClient.get<Student[]>("/tutors/me/students", { params: { page: next } }); setStudents(old => next === 1 ? data : [...old, ...data]); setPage(next); setMore(data.length === 50); setError(""); }
    catch { setError("Could not load your students. Please retry."); }
    finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <Page title="Your students" subtitle="The learners you support, one lesson at a time." back={false}>
    <ErrorNotice message={error} retry={() => load()} />
    {students.map(s => <Card key={s.id}><Text style={ui.heading}>{s.name}</Text><Text style={ui.text}>{s.sessions} confirmed or completed sessions</Text><Text style={ui.muted}>Latest scheduled lesson: {new Date(s.last_session).toLocaleDateString()}</Text><Action label="Open learning sessions" secondary onPress={() => router.push("/learning")} /></Card>)}
    {!busy && !error && !students.length && <Card><Text style={ui.heading}>Your first learner is ahead</Text><Text style={ui.text}>Students appear here after a session is confirmed.</Text></Card>}
    {(busy || more) && <Action label="Load more students" busy={busy} secondary onPress={() => load(page + 1)} />}
  </Page>;
}
