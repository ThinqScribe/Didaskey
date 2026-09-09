import { useCallback, useState } from "react";
import { Text } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/store/auth";
import type { TutorSummary } from "@/lib/api/tutors";
import { extractErrorMessage } from "@/lib/api/auth";

export default function Administration() {
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const load = useCallback(async (next = 1) => { if (user?.role !== "admin") return; setBusy(true); try { const { data } = await apiClient.get("/admin/tutors", { params: { page: next, page_size: 50 } }); setTutors(old => next === 1 ? data.items : [...old, ...data.items]); setPage(next); setMore(next < data.total_pages); setError(""); } catch(e) { setError(extractErrorMessage(e, "Could not load tutor applications.")); } finally { setBusy(false); } }, [user?.role]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function verify(id: number, status: string) { setBusy(true); try { await apiClient.patch(`/admin/tutors/${id}`, { verification_status: status }); await load(); } catch(e) { setError(extractErrorMessage(e, "Could not update this tutor.")); } finally { setBusy(false); } }
  if (user?.role !== "admin") return <Page title="Administration"><ErrorNotice message="Administrator access is required." /></Page>;
  return <Page title="Didaskey administration" subtitle="Review tutor applications and manage learning operations." back={false}>
    <Action label="Accounts, bookings & payments" onPress={() => router.push("/admin/operations")} />
    <Action label="Sessions and learning activity" onPress={() => router.push("/learning")} secondary />
    <ErrorNotice message={error} retry={() => load()} />
    <Text style={ui.heading}>Tutor verification</Text>
    {tutors.map(t => <Card key={t.id}><Text style={ui.heading}>{t.display_name}</Text><Text style={ui.muted}>{t.verification_status} · {t.location_city ?? "Location not provided"}</Text><Action label="Review public profile" onPress={() => router.push(`/tutor/${t.id}`)} secondary /><Action label="Approve tutor" disabled={busy || t.verification_status === "verified"} onPress={() => verify(t.id, "verified")} /><Action label="Reject application" secondary disabled={busy || t.verification_status === "rejected"} onPress={() => verify(t.id, "rejected")} /></Card>)}
    {!busy && !tutors.length && !error && <Card><Text style={ui.text}>No tutor applications yet.</Text></Card>}
    {(busy || more) && <Action label="Load more tutors" busy={busy} onPress={() => load(page + 1)} secondary />}
    <Action label="Sign out" secondary onPress={async () => { await signOut(); router.replace("/(auth)/sign-in"); }} />
  </Page>;
}
