import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { getTutorStats, getMyTutorProfile, listTutorBookings, type TutorStats } from "@/lib/api/tutor-portal";
import { formatCurrency, type BookingResponse } from "@/lib/api/bookings";
import { extractErrorMessage } from "@/lib/api/auth";

export default function TutorEarnings() {
  const [stats, setStats] = useState<TutorStats | null>(null);
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (next = 1) => {
    setBusy(true); setError("");
    try {
      const [p, s] = await Promise.all([getMyTutorProfile(), getTutorStats()]);
      const result = await listTutorBookings(p.id, { status: "completed", page: next, page_size: 25 });
      setStats(s); setBookings(old => next === 1 ? result.items : [...old, ...result.items]); setPage(next); setMore(next < result.total_pages);
    } catch(e) { setError(extractErrorMessage(e, "Could not load earnings. Please try again.")); }
    finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <Page title="Earnings" subtitle="A clear record of your completed, paid lessons." back={false}>
    <ErrorNotice message={error} retry={() => load()} />
    {stats && <Card><Text style={ui.muted}>Gross lesson earnings</Text><Text style={ui.title}>{formatCurrency(stats.total_earnings, stats.currency)}</Text><Text style={ui.muted}>Paid, completed sessions, excluding refunded transactions. This is not a withdrawable payout balance.</Text><View style={ui.row}><Text style={ui.text}>{stats.completed_sessions} completed sessions</Text><Text style={ui.text}>{stats.total_hours_taught} teaching hours</Text></View></Card>}
    <Text style={ui.heading}>Completed lessons</Text>
    {bookings.map(b => <Card key={b.id}><Text style={ui.heading}>{b.subject_name ?? "Tutoring lesson"}</Text><Text style={ui.text}>{b.student_name ?? "Student"} · {formatCurrency(b.amount, b.currency)}</Text><Text style={ui.muted}>{new Date(b.scheduled_at).toLocaleDateString()} · Payment {b.transaction?.status ?? "pending"}</Text><Action label="View lesson and payment record" secondary onPress={() => router.push(`/learning/${b.id}`)} /></Card>)}
    {!busy && !error && !bookings.length && <Card><Text style={ui.text}>Your completed lessons will appear here.</Text></Card>}
    {(busy || more) && <Action label="Load more" busy={busy} secondary onPress={() => load(page + 1)} />}
  </Page>;
}
