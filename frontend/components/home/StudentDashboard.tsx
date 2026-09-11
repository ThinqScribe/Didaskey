import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors, TabBar } from "@/constants";
import { useAuthStore } from "@/lib/store/auth";
import { getSubjects, searchTutors, type Subject, type TutorSummary } from "@/lib/api/tutors";
import { listBookings, formatBookingDate, formatBookingTimeRange, type BookingResponse } from "@/lib/api/bookings";
import { getProgress, type Progress } from "@/lib/api/learning";
import { useRefresh } from "@/lib/hooks/useRefresh";
import SubjectPill from "@/components/home/SubjectPill";
import TutorCard from "@/components/home/TutorCard";
import { EmptyState, Eyebrow, IconButton, Metric, ScreenHeading, SectionHeading } from "@/components/ui/AppChrome";

export default function StudentDashboard() {
  const user = useAuthStore(s => s.user);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [activeSubject, setActiveSubject] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (subjectId: number | null = activeSubject) => {
    setError("");
    const results = await Promise.allSettled([
      getSubjects(),
      searchTutors({ subject_id: subjectId ?? undefined, page: 1, page_size: 4 }),
      listBookings({ page: 1, page_size: 50 }),
      getProgress(),
    ]);
    if (results[0].status === "fulfilled") setSubjects(results[0].value);
    if (results[1].status === "fulfilled") setTutors(results[1].value.items);
    if (results[2].status === "fulfilled") setBookings(results[2].value.items);
    if (results[3].status === "fulfilled") setProgress(results[3].value);
    if (results.some(result => result.status === "rejected")) setError("Some updates could not load. Pull down to try again.");
    setLoading(false);
  }, [activeSubject]);

  useEffect(() => { void load(); }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);
  const upcoming = useMemo(() => bookings.filter(b => b.status === "confirmed" && new Date(b.scheduled_at) > new Date()).sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0], [bookings]);
  const selectSubject = (id: number) => { const next = activeSubject === id ? null : id; setActiveSubject(next); };

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.teal} />} contentContainerStyle={styles.content}>
      <ScreenHeading title={`Hi, ${user?.first_name ?? "learner"}`} subtitle="What would you like to understand today?" action={<IconButton icon="notifications-outline" label="Open notifications" onPress={() => router.push("/notifications")} />} />

      <Pressable accessibilityRole="search" onPress={() => router.push("/(tabs)/search")} style={styles.search}>
        <Ionicons name="search-outline" size={20} color={Colors.deepTeal} /><Text style={styles.searchText}>Search tutors, subjects, or skills</Text><View style={styles.filterIcon}><Ionicons name="options-outline" size={18} color={Colors.deepTeal} /></View>
      </Pressable>

      {upcoming ? <Pressable accessibilityRole="button" onPress={() => router.push(`/learning/${upcoming.id}`)} style={styles.hero}>
        <View style={styles.heroTop}><Eyebrow light>Next lesson</Eyebrow><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>{upcoming.session_format === "online" ? "Online" : "In person"}</Text></View></View>
        <Text style={styles.heroTitle}>{upcoming.subject_name ?? "Tutoring session"}</Text>
        <Text style={styles.heroTutor}>with {upcoming.tutor_name}</Text>
        <View style={styles.heroBottom}><View><Text style={styles.heroDate}>{formatBookingDate(upcoming.scheduled_at)}</Text><Text style={styles.heroTime}>{formatBookingTimeRange(upcoming.scheduled_at, upcoming.duration_minutes)}</Text></View><View style={styles.heroButton}><Text style={styles.heroButtonText}>Open lesson</Text><Ionicons name="arrow-forward" size={17} color={Colors.deepTeal} /></View></View>
      </Pressable> : <View style={styles.heroEmpty}><View style={{ flex: 1, gap: 5 }}><Eyebrow>Start learning</Eyebrow><Text style={styles.emptyHeroTitle}>Find the right tutor for your next goal.</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/search")} style={styles.roundAction}><Ionicons name="arrow-forward" size={20} color="white" /></Pressable></View>}

      <View style={styles.metrics}>
        <Metric icon="checkmark-done-outline" value={String(progress?.completed_sessions ?? 0)} label="Lessons done" />
        <Metric icon="book-outline" value={String(progress?.pending ?? 0)} label="To complete" tint={Colors.paleGold} />
        <Metric icon="time-outline" value={`${Math.round((progress?.learning_minutes ?? 0) / 60)}h`} label="Learning time" tint={Colors.paleBlue} />
      </View>

      <View><SectionHeading title="Explore subjects" actionLabel="See all" onAction={() => router.push("/(tabs)/search")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>{subjects.slice(0, 8).map(subject => <SubjectPill key={subject.id} subject={subject} active={activeSubject === subject.id} onPress={() => selectSubject(subject.id)} />)}</ScrollView>
      </View>

      <View><SectionHeading title={activeSubject ? "Tutors for this subject" : "Tutors students love"} actionLabel="Browse all" onAction={() => router.push("/(tabs)/search")} />
        {loading ? <ActivityIndicator color={Colors.teal} style={{ padding: 30 }} /> : tutors.length ? tutors.map(tutor => <TutorCard key={tutor.id} tutor={tutor} onPress={() => router.push(`/tutor/${tutor.id}`)} />) : <EmptyState icon="people-outline" title="No tutors here yet" body="Try another subject or browse every available tutor." />}
      </View>
      {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 20, paddingTop: 18, paddingBottom: TabBar.height + 50, gap: 24 },
  search: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingLeft: 17, paddingRight: 8, gap: 11, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, borderRadius: 18 },
  searchText: { flex: 1, fontFamily: "sans-medium", fontSize: 14, color: Colors.mutedForeground },
  filterIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: Colors.paleTeal, alignItems: "center", justifyContent: "center" },
  hero: { minHeight: 218, borderRadius: 30, padding: 22, backgroundColor: Colors.deepTeal, overflow: "hidden", justifyContent: "space-between" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.softMint },
  liveText: { fontFamily: "sans-semibold", fontSize: 11, color: "white" },
  heroTitle: { marginTop: 14, fontFamily: "sans-bold", fontSize: 27, letterSpacing: -0.6, color: "white" },
  heroTutor: { marginTop: 3, fontFamily: "sans-medium", fontSize: 14, color: "#B9D9D3" },
  heroBottom: { marginTop: 25, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  heroDate: { fontFamily: "sans-semibold", fontSize: 13, color: "white" },
  heroTime: { marginTop: 3, fontFamily: "sans-regular", fontSize: 12, color: "#B9D9D3" },
  heroButton: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 15, paddingHorizontal: 15, minHeight: 44, backgroundColor: Colors.softMint },
  heroButtonText: { fontFamily: "sans-bold", fontSize: 12, color: Colors.deepTeal },
  heroEmpty: { minHeight: 142, borderRadius: 28, padding: 21, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.paleTeal, borderWidth: 1, borderColor: "#C9E6DA" },
  emptyHeroTitle: { maxWidth: 280, fontFamily: "sans-bold", fontSize: 21, lineHeight: 28, letterSpacing: -0.4, color: Colors.deepTeal },
  roundAction: { width: 48, height: 48, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: Colors.deepTeal },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  error: { borderRadius: 16, padding: 14, backgroundColor: "#FFF0E9", fontFamily: "sans-medium", fontSize: 13, color: "#9D3128" },
});
