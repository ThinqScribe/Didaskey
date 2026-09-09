import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Field, Page, ui } from "@/components/ui/Workspace";
import { apiClient } from "@/lib/api/client";
import { extractErrorMessage, type User } from "@/lib/api/auth";
import { formatCurrency, type BookingResponse } from "@/lib/api/bookings";
import { useAuthStore } from "@/lib/store/auth";

export default function Operations() {
  const role = useAuthStore(s => s.user?.role);
  const [tab, setTab] = useState<"users" | "bookings">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ label: string; path: string; method: "post" | "patch"; body: object } | null>(null);
  const load = useCallback(async (next = 1, query = "") => { if (role !== "admin") return; setBusy(true); setError(""); try { const { data } = await apiClient.get(`/admin/${tab}`, { params: { page: next, search: query } }); if (tab === "users") setUsers(old => next === 1 ? data : [...old, ...data]); else setBookings(old => next === 1 ? data : [...old, ...data]); setPage(next); setMore(data.length === 50); } catch(e) { setError(extractErrorMessage(e, "Could not load operations.")); } finally { setBusy(false); } }, [tab, role]);
  useFocusEffect(useCallback(() => { setSearch(""); void load(); }, [load]));
  async function execute() { if (!confirm) return; setBusy(true); try { await apiClient.request({ url: confirm.path, method: confirm.method, data: confirm.body }); setConfirm(null); await load(1, search); } catch(e) { setError(extractErrorMessage(e, "The operation failed. Check current status before retrying.")); } finally { setBusy(false); } }
  if (role !== "admin") return <Page title="Operations"><ErrorNotice message="Administrator access required." /></Page>;
  return <Page title="Operations" subtitle="Manage accounts, bookings, and payment exceptions.">
    <View style={ui.row}><Action label="Accounts" secondary={tab !== "users"} onPress={() => { setConfirm(null); setTab("users"); }} /><Action label="Bookings & payments" secondary={tab !== "bookings"} onPress={() => { setConfirm(null); setTab("bookings"); }} /></View>
    <ErrorNotice message={error} retry={() => load(1, search)} />
    {confirm && <Card><Text style={ui.heading}>{confirm.label}?</Text><Text style={ui.text}>This changes the stored account or payment state. Check the selected record before continuing.</Text><Action label="Confirm action" busy={busy} onPress={execute} /><Action label="Go back" secondary onPress={() => setConfirm(null)} /></Card>}
    {tab === "users" ? <><Field label="Search accounts" value={search} onChangeText={setSearch} autoCapitalize="none" /><Action label="Search" busy={busy} secondary onPress={() => load(1, search)} />{users.map(user => <Card key={user.id}><Text style={ui.heading}>{user.first_name} {user.last_name}</Text><Text style={ui.muted}>{user.email} · {user.role} · {user.is_active ? "Active" : "Disabled"}</Text>{user.role !== "admin" && <Action label={user.is_active ? "Disable account" : "Enable account"} secondary onPress={() => setConfirm({ label: `${user.is_active ? "Disable" : "Enable"} ${user.email}`, path: `/admin/users/${user.id}/status`, method: "patch", body: { is_active: !user.is_active } })} />}</Card>)}</> : bookings.map(booking => <Card key={booking.id}><Text style={ui.heading}>#{booking.id} · {booking.tutor_name}</Text><Text style={ui.text}>{booking.student_name} · {new Date(booking.scheduled_at).toLocaleString()}</Text><Text style={ui.muted}>{booking.status} · {formatCurrency(booking.amount, booking.currency)} · payment {booking.transaction?.status ?? "pending"}</Text><Action label="View session details" secondary onPress={() => router.push(`/learning/${booking.id}`)} />{["pending_payment", "confirmed"].includes(booking.status) && <Action label="Cancel booking" secondary onPress={() => setConfirm({ label: `Cancel booking #${booking.id}`, path: `/bookings/${booking.id}/cancel`, method: "patch", body: { reason: "Cancelled by administrator" } })} />}{booking.status === "cancelled" && booking.transaction?.status === "success" && <Action label="Issue full refund" secondary onPress={() => setConfirm({ label: `Refund ${formatCurrency(booking.amount, booking.currency)} for booking #${booking.id}`, path: `/payments/bookings/${booking.id}/refund`, method: "post", body: {} })} />}</Card>)}
    {more && <Action label="Load more" busy={busy} onPress={() => load(page + 1, search)} secondary />}
  </Page>;
}
