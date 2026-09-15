import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { LoadingState, Rise } from "@/components/ui/Motion";
import { getTutorStats, getMyTutorProfile, listTutorBookings, type TutorStats } from "@/lib/api/tutor-portal";
import { formatCurrency, type BookingResponse } from "@/lib/api/bookings";
import { extractErrorMessage } from "@/lib/api/auth";
import { Colors } from "@/constants";

const TUTOR_PAYOUT_RATE = 0.7;

function moneyValue(value?: string | number | null) {
  const parsed = typeof value === "number" ? value : parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function tutorPayoutFor(booking: BookingResponse) {
  return moneyValue(booking.amount) * TUTOR_PAYOUT_RATE;
}

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

  const payout = moneyValue(stats?.tutor_payout ?? stats?.total_earnings);
  const gross = moneyValue(stats?.gross_earnings);
  const didaskeyFee = moneyValue(stats?.platform_fee);
  const currency = stats?.currency ?? "NGN";

  return <Page title="Earnings" subtitle="A clear record of your completed, paid lessons." back={false}>
    <ErrorNotice message={error} retry={() => load()} />
    {busy && !stats ? (
      <LoadingState />
    ) : stats ? (
      <Rise>
        <Card>
          <Text style={ui.muted}>Your payout</Text>
          <Text style={ui.title}>{formatCurrency(payout, currency)}</Text>
          <Text style={ui.muted}>70% of paid, completed lessons. Didaskey retains 30% for platform operations.</Text>
          <View style={styles.splitBox}>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Gross lesson payments</Text>
              <Text style={styles.splitValue}>{formatCurrency(gross, currency)}</Text>
            </View>
            <View style={styles.splitRow}>
              <Text style={styles.splitLabel}>Didaskey fee</Text>
              <Text style={styles.splitValue}>-{formatCurrency(didaskeyFee, currency)}</Text>
            </View>
            <View style={[styles.splitRow, styles.splitTotal]}>
              <Text style={styles.splitTotalLabel}>Tutor earnings</Text>
              <Text style={styles.splitTotalValue}>{formatCurrency(payout, currency)}</Text>
            </View>
          </View>
          <View style={ui.row}>
            <Text style={ui.text}>{stats.completed_sessions} completed sessions</Text>
            <Text style={ui.text}>{stats.total_hours_taught} teaching hours</Text>
          </View>
        </Card>
      </Rise>
    ) : null}
    <Text style={ui.heading}>Completed lessons</Text>
    {bookings.map((b, index) => (
      <Rise key={b.id} delay={Math.min(180, index * 35)}>
        <Card>
          <Text style={ui.heading}>{b.subject_name ?? "Tutoring lesson"}</Text>
          <Text style={ui.text}>{b.student_name ?? "Student"} · Your payout {formatCurrency(tutorPayoutFor(b), b.currency)}</Text>
          <Text style={ui.muted}>Gross {formatCurrency(b.amount, b.currency)} · Didaskey fee {formatCurrency(moneyValue(b.amount) * 0.3, b.currency)}</Text>
          <Text style={ui.muted}>{new Date(b.scheduled_at).toLocaleDateString()} · Payment {b.transaction?.status ?? "pending"}</Text>
          <Action label="View lesson and payment record" secondary onPress={() => router.push(`/learning/${b.id}`)} />
        </Card>
      </Rise>
    ))}
    {!busy && !error && !bookings.length && <Card><Text style={ui.text}>Your completed lessons will appear here.</Text></Card>}
    {(busy || more) && <Action label="Load more" busy={busy} secondary onPress={() => load(page + 1)} />}
  </Page>;
}

const styles = StyleSheet.create({
  splitBox: {
    gap: 9,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.muted,
  },
  splitRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  splitLabel: {
    flex: 1,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: Colors.mutedForeground,
  },
  splitValue: {
    fontFamily: "sans-bold",
    fontSize: 13,
    color: Colors.foreground,
  },
  splitTotal: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 9,
  },
  splitTotalLabel: {
    flex: 1,
    fontFamily: "sans-bold",
    fontSize: 14,
    color: Colors.foreground,
  },
  splitTotalValue: {
    fontFamily: "sans-bold",
    fontSize: 15,
    color: Colors.teal,
  },
});
