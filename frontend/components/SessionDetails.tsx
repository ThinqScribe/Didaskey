import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Action, Card, ErrorNotice, Field, ui } from "@/components/ui/Workspace";
import { getBooking, cancelBooking, formatCurrency, type BookingResponse } from "@/lib/api/bookings";
import { submitReview } from "@/lib/api/tutors";
import { extractErrorMessage } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/store/auth";
import { apiClient } from "@/lib/api/client";
import { JoinSessionButton } from "@/components/classroom/JoinSessionButton";
import RescheduleSession from "@/components/RescheduleSession";

export default function SessionDetails({ bookingId }: { bookingId: number }) {
  const user = useAuthStore(s => s.user);
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const load = useCallback(async () => { try { setBooking(await getBooking(bookingId)); } catch(e) { setError(extractErrorMessage(e, "Could not load session details.")); } }, [bookingId]);
  useEffect(() => { void load(); }, [load]);
  async function review() { setBusy(true); setError(""); try { await submitReview(booking!.tutor_id, rating, comment); setReviewed(true); } catch(e) { setError(extractErrorMessage(e, "Could not save your review.")); } finally { setBusy(false); } }
  async function cancel() { setBusy(true); setError(""); try { setBooking(await cancelBooking(bookingId)); setConfirmCancel(false); } catch(e) { setError(extractErrorMessage(e, "This booking cannot be cancelled.")); } finally { setBusy(false); } }
  async function complete() { setBusy(true); try { await apiClient.patch(`/bookings/${bookingId}/complete`); await load(); } catch(e) { setError(extractErrorMessage(e)); } finally { setBusy(false); } }
  return <View style={{ gap: 16 }}><ErrorNotice message={error} retry={load} />{booking && <Card>
    <Text style={ui.heading}>{booking.subject_name ?? "Tutoring session"}</Text><Text style={ui.text}>With {booking.tutor_name}</Text><Text style={ui.muted}>{new Date(booking.scheduled_at).toLocaleString()} · {booking.duration_minutes} minutes · {booking.session_format === "online" ? "Online" : "In person"}</Text>
    <Text style={ui.muted}>Booking #{booking.id} · {booking.status.replaceAll("_", " ")}</Text><Text style={ui.heading}>{formatCurrency(booking.amount, booking.currency)}</Text><Text style={ui.muted}>Payment: {booking.transaction?.status ?? "Awaiting payment"}</Text>
    <JoinSessionButton booking={booking} counterpartName={user?.role === "student" ? booking.tutor_name : booking.student_name} />
    {["student", "admin"].includes(user?.role ?? "") && booking.status === "confirmed" && <RescheduleSession booking={booking} onSaved={setBooking} />}
    {booking.transaction?.paid_at && <Text selectable style={ui.muted}>Paid {new Date(booking.transaction.paid_at).toLocaleString()} · Reference {booking.transaction.paystack_reference}</Text>}
    {user?.role === "student" && ["pending_payment", "confirmed"].includes(booking.status) && <Action label="Cancel booking" secondary onPress={() => setConfirmCancel(true)} />}
    {confirmCancel && <><Text style={ui.text}>Cancel this session? The cancellation policy applies; refunds are handled separately.</Text><Action label="Yes, cancel session" busy={busy} onPress={cancel} /><Action label="Keep session" secondary onPress={() => setConfirmCancel(false)} /></>}
    {user?.role === "admin" && booking.status === "confirmed" && <Action label="Mark session completed" busy={busy} onPress={complete} />}
    {user?.role === "student" && booking.status === "completed" && <>{reviewed ? <Text style={ui.text}>Thank you. Your review has been saved.</Text> : <><Text style={ui.heading}>How was your lesson?</Text><View style={ui.row}>{[1, 2, 3, 4, 5].map(n => <Action key={n} label={`${n} ★`} secondary={rating !== n} onPress={() => setRating(n)} />)}</View><Field label="Your review" value={comment} onChangeText={setComment} multiline maxLength={2000} /><Action label="Submit review" busy={busy} onPress={review} /></>}</>}
  </Card>}</View>;
}
