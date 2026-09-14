import { useCallback, useState } from "react";
import { Switch, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Action, Card, ErrorNotice, Field, Page, ui } from "@/components/ui/Workspace";
import { Colors } from "@/constants";
import { getMyTutorProfile, updateMyProfile, setAvailability, DAYS } from "@/lib/api/tutor-portal";
import { getSubjects, type Subject } from "@/lib/api/tutors";
import { extractErrorMessage } from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";

type Window = { day_of_week: string; start_time: string; end_time: string };
export default function TutorSettings() {
  const [rate, setRate] = useState("");
  const [bio, setBio] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [slots, setSlots] = useState<Window[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { const [profile, catalog] = await Promise.all([getMyTutorProfile(), getSubjects()]); setRate(profile.rate_per_hour); setBio(profile.bio ?? ""); setQualifications(profile.qualifications ?? ""); setSlots(profile.availability_slots); setSelected(profile.tutor_subjects.map(s => s.subject_id)); setSubjects(catalog); setStatus(profile.verification_status); setError(""); } catch(e) { setError(extractErrorMessage(e, "Could not load tutor settings.")); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function saveProfile() { setBusy(true); setError(""); setSaved(""); try { if (!Number.isFinite(Number(rate)) || Number(rate) <= 0) throw new Error("rate"); await updateMyProfile({ rate_per_hour: Number(rate), bio, qualifications }); setSaved("Profile saved."); } catch(e) { setError(extractErrorMessage(e, "Enter a positive hourly rate and check your connection.")); } finally { setBusy(false); } }
  async function saveSchedule() { setBusy(true); setError(""); setSaved(""); try { await setAvailability({ slots }); setSaved("Availability saved."); } catch(e) { setError(extractErrorMessage(e, "Check each time range. End time must be after start time.")); } finally { setBusy(false); } }
  async function toggleSubject(id: number) { setBusy(true); setError(""); try { if (selected.includes(id)) await apiClient.delete(`/tutors/me/subjects/${id}`); else await apiClient.post("/tutors/me/subjects", { subject_id: id }); setSelected(old => old.includes(id) ? old.filter(s => s !== id) : [...old, id]); } catch(e) { setError(extractErrorMessage(e, "Could not update subjects.")); } finally { setBusy(false); } }
  return <Page title="Teaching setup" subtitle="Make your profile clear, set your rate, and choose when you teach.">
    <ErrorNotice message={error} retry={load} />{saved && <Text accessibilityLiveRegion="polite" style={ui.text}>{saved}</Text>}
    <Card><Text style={ui.heading}>Verification: {status || "Loading"}</Text><Text style={ui.text}>Complete your profile, qualifications, subjects, and schedule. An administrator reviews your profile before it appears in tutor search.</Text><Field label="About your teaching" value={bio} onChangeText={setBio} multiline /><Field label="Qualifications" value={qualifications} onChangeText={setQualifications} multiline /><Field label="Hourly rate (NGN)" value={rate} onChangeText={setRate} keyboardType="decimal-pad" /><Action label="Save profile" busy={busy} onPress={saveProfile} /></Card>
    <Card><Text style={ui.heading}>Subjects you teach</Text>{subjects.map(subject => <View key={subject.id} style={ui.row}><Text style={[ui.text, { flex: 1 }]}>{subject.name}</Text><Switch accessibilityLabel={`Teach ${subject.name}`} disabled={busy} value={selected.includes(subject.id)} onValueChange={() => toggleSubject(subject.id)} /></View>)}</Card>
    <Card><Text style={ui.heading}>Weekly availability</Text><Text style={ui.muted}>Times are in Africa/Lagos (WAT). Use 24-hour time, for example 09:00–12:00.</Text>
      {slots.map((slot, index) => <View key={index} style={{ gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: Colors.border }}><Text style={ui.heading}>{slot.day_of_week}</Text><Field label="Start time" value={slot.start_time.slice(0, 5)} onChangeText={value => setSlots(old => old.map((s, i) => i === index ? { ...s, start_time: value } : s))} /><Field label="End time" value={slot.end_time.slice(0, 5)} onChangeText={value => setSlots(old => old.map((s, i) => i === index ? { ...s, end_time: value } : s))} /><Action label="Remove window" secondary onPress={() => setSlots(old => old.filter((_, i) => i !== index))} /></View>)}
      <Text style={ui.muted}>Add a window</Text><View style={ui.row}>{DAYS.map(day => <Action key={day} label={day.slice(0, 3)} secondary onPress={() => setSlots(old => [...old, { day_of_week: day, start_time: "09:00", end_time: "12:00" }])} />)}</View><Action label="Save availability" busy={busy} onPress={saveSchedule} />
    </Card>
  </Page>;
}
