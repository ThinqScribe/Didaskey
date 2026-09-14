import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Action, Card, ErrorNotice, Field, ui } from "@/components/ui/Workspace";
import { JoinSessionButton } from "@/components/classroom/JoinSessionButton";
import RescheduleSession from "@/components/RescheduleSession";
import { Colors } from "@/constants";
import { extractErrorMessage } from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";
import {
  cancelBooking,
  formatBookingDate,
  formatBookingTimeRange,
  formatCurrency,
  getBooking,
  sessionFormatLabel,
  type BookingResponse,
  type BookingStatus,
} from "@/lib/api/bookings";
import { useAuthStore } from "@/lib/store/auth";
import { submitReview } from "@/lib/api/tutors";

const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  pending_payment: { label: "Pending payment", color: Colors.gold, bg: Colors.paleGold },
  confirmed: { label: "Confirmed", color: Colors.success, bg: "#E7FAF1" },
  completed: { label: "Completed", color: Colors.deepTeal, bg: Colors.muted },
  cancelled: { label: "Cancelled", color: Colors.destructive, bg: "#FFECEA" },
  no_show: { label: "No show", color: Colors.mutedForeground, bg: Colors.muted },
};

function cleanStatus(status: BookingStatus) {
  return STATUS_META[status] ?? { label: status.replaceAll("_", " "), color: Colors.mutedForeground, bg: Colors.muted };
}

function DetailRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.detailBorder]}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={17} color={Colors.deepTeal} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export default function SessionDetails({ bookingId }: { bookingId: number }) {
  const user = useAuthStore(s => s.user);
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBooking(await getBooking(bookingId));
      setError("");
    } catch (e) {
      setError(extractErrorMessage(e, "Could not load session details."));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review() {
    if (!booking) return;
    setBusy(true);
    setError("");
    try {
      await submitReview(booking.tutor_id, rating, comment);
      setReviewed(true);
    } catch (e) {
      setError(extractErrorMessage(e, "Could not save your review."));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      setBooking(await cancelBooking(bookingId));
      setConfirmCancel(false);
    } catch (e) {
      setError(extractErrorMessage(e, "This booking cannot be cancelled."));
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setBusy(true);
    setError("");
    try {
      await apiClient.patch(`/bookings/${bookingId}/complete`);
      await load();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const lesson = useMemo(() => {
    if (!booking) return null;
    return {
      subject: booking.subject_name ?? "Tutoring session",
      counterpartLabel: user?.role === "student" ? "Tutor" : "Student",
      counterpartName: user?.role === "student" ? booking.tutor_name : booking.student_name ?? "Student",
      date: formatBookingDate(booking.scheduled_at),
      time: formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes),
      duration: `${booking.duration_minutes} min`,
      format: sessionFormatLabel(booking.session_format),
      amount: formatCurrency(booking.amount, booking.currency),
      payment: booking.transaction?.status ?? "Awaiting payment",
      paidAt: booking.transaction?.paid_at ? new Date(booking.transaction.paid_at).toLocaleString() : null,
      reference: booking.transaction?.paystack_reference ?? null,
      status: cleanStatus(booking.status),
    };
  }, [booking, user?.role]);

  if (loading && !booking) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <ErrorNotice message={error} retry={load} />

      {booking && lesson ? (
        <>
          <Card>
            <View style={styles.headerRow}>
              <View style={styles.lessonIcon}>
                <Ionicons name="calendar-outline" size={22} color={Colors.deepTeal} />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.subject} numberOfLines={1}>{lesson.subject}</Text>
                <Text style={styles.counterpart} numberOfLines={1}>
                  {lesson.counterpartLabel}: {lesson.counterpartName}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: lesson.status.bg }]}>
                <Text style={[styles.statusText, { color: lesson.status.color }]}>{lesson.status.label}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <DetailRow icon="calendar-outline" label="Date" value={lesson.date} />
            <DetailRow icon="time-outline" label="Time" value={lesson.time} />
            <DetailRow icon="hourglass-outline" label="Duration" value={lesson.duration} />
            <DetailRow
              icon={booking.session_format === "online" ? "laptop-outline" : "location-outline"}
              label="Format"
              value={lesson.format}
              last
            />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Payment</Text>
            <DetailRow icon="receipt-outline" label="Booking" value={`#${booking.id}`} />
            <DetailRow icon="card-outline" label="Status" value={lesson.payment} />
            <DetailRow icon="cash-outline" label="Amount" value={lesson.amount} last={!lesson.paidAt && !lesson.reference} />
            {lesson.paidAt ? <DetailRow icon="checkmark-circle-outline" label="Paid" value={lesson.paidAt} last={!lesson.reference} /> : null}
            {lesson.reference ? <Text selectable style={styles.reference}>Reference {lesson.reference}</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Session actions</Text>
            <View style={styles.actions}>
              <JoinSessionButton
                booking={booking}
                counterpartName={user?.role === "student" ? booking.tutor_name : booking.student_name}
              />
              {["student", "admin"].includes(user?.role ?? "") && booking.status === "confirmed" ? (
                <RescheduleSession booking={booking} onSaved={setBooking} />
              ) : null}
              {user?.role === "student" && ["pending_payment", "confirmed"].includes(booking.status) && !confirmCancel ? (
                <Action label="Cancel booking" secondary onPress={() => setConfirmCancel(true)} />
              ) : null}
              {user?.role === "admin" && booking.status === "confirmed" ? (
                <Action label="Mark session completed" busy={busy} onPress={complete} />
              ) : null}
            </View>

            {confirmCancel ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>Cancel this session?</Text>
                <Text style={styles.noticeText}>The cancellation policy applies; refunds are handled separately.</Text>
                <Action label="Yes, cancel session" busy={busy} onPress={cancel} />
                <Action label="Keep session" secondary onPress={() => setConfirmCancel(false)} />
              </View>
            ) : null}
          </Card>

          {user?.role === "student" && booking.status === "completed" ? (
            <Card>
              {reviewed ? (
                <Text style={ui.text}>Thank you. Your review has been saved.</Text>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>How was your lesson?</Text>
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Action key={n} label={String(n)} secondary={rating !== n} onPress={() => setRating(n)} />
                    ))}
                  </View>
                  <Field label="Your review" value={comment} onChangeText={setComment} multiline maxLength={2000} />
                  <Action label="Submit review" busy={busy} onPress={review} />
                </>
              )}
            </Card>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 14,
  },
  loading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lessonIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.paleTeal,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  subject: {
    fontFamily: "sans-bold",
    fontSize: 19,
    color: Colors.foreground,
  },
  counterpart: {
    marginTop: 3,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: Colors.mutedForeground,
  },
  statusPill: {
    minHeight: 30,
    borderRadius: 15,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  statusText: {
    fontFamily: "sans-bold",
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  detailRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.muted,
  },
  detailLabel: {
    width: 78,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: Colors.mutedForeground,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontFamily: "sans-semibold",
    fontSize: 13,
    color: Colors.foreground,
  },
  sectionTitle: {
    fontFamily: "sans-bold",
    fontSize: 16,
    color: Colors.foreground,
  },
  reference: {
    fontFamily: "sans-medium",
    fontSize: 12,
    lineHeight: 18,
    color: Colors.mutedForeground,
  },
  actions: {
    gap: 10,
  },
  notice: {
    gap: 10,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.muted,
  },
  noticeTitle: {
    fontFamily: "sans-bold",
    fontSize: 14,
    color: Colors.foreground,
  },
  noticeText: {
    fontFamily: "sans-medium",
    fontSize: 13,
    lineHeight: 19,
    color: Colors.mutedForeground,
  },
  ratingRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
});
