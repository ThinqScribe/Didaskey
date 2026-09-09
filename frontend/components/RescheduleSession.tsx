import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Action, Field, ui } from "@/components/ui/Workspace";
import { apiClient } from "@/lib/api/client";
import { extractErrorMessage } from "@/lib/api/auth";
import type { BookingResponse } from "@/lib/api/bookings";

export default function RescheduleSession({ booking, onSaved }: { booking: BookingResponse; onSaved: (booking: BookingResponse) => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => { generation.current++; setSlots([]); setSelected(""); }, [day]);
  async function check() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { setError("Enter a date as YYYY-MM-DD."); return; }
    const request = ++generation.current;
    setBusy(true); setError(""); setSelected("");
    try {
      const { data } = await apiClient.get(`/tutors/${booking.tutor_id}/slots`, { params: { day, duration: booking.duration_minutes } });
      if (request === generation.current) { setSlots(data.slots); if (!data.slots.length) setError("No available times on this date. Try another day."); }
    } catch (e) { if (request === generation.current) setError(extractErrorMessage(e)); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const { data } = await apiClient.patch(`/bookings/${booking.id}/reschedule`, { scheduled_at: `${day}T${selected}+01:00` });
      onSaved(data); setOpen(false); setSelected(""); setSlots([]);
    } catch (e) { setError(extractErrorMessage(e, "Could not reschedule. Please check availability again.")); }
    finally { setBusy(false); }
  }
  if (!open) return <Action label="Reschedule session" secondary onPress={() => setOpen(true)} />;
  return <View style={{ gap: 12 }}>
    <Text style={ui.heading}>Choose another time</Text>
    <Text style={ui.muted}>Times are West Africa Time (UTC+1). Students must reschedule at least 24 hours before both start times. Your tutor, duration and payment stay unchanged.</Text>
    <Field label="New date (YYYY-MM-DD)" value={day} onChangeText={setDay} placeholder="2026-10-15" maxLength={10} editable={!busy} />
    <Action label="Find available times" busy={busy} secondary onPress={check} />
    <View style={ui.row}>{slots.map(slot => <Action key={slot} label={slot.slice(0, 5)} secondary={selected !== slot} disabled={busy} onPress={() => setSelected(slot)} />)}</View>
    {!!error && <Text accessibilityLiveRegion="polite" style={ui.text}>{error}</Text>}
    {!!selected && <><Text style={ui.text}>Move this session to {day} at {selected.slice(0, 5)} WAT?</Text><Action label="Confirm new time" busy={busy} onPress={save} /></>}
    <Action label="Keep current time" disabled={busy} secondary onPress={() => setOpen(false)} />
  </View>;
}
