import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Spacing, TabBar } from "@/constants";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { listTutorBookings, getMyTutorProfile } from "@/lib/api/tutor-portal";
import type { BookingResponse } from "@/lib/api/bookings";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentSummary {
  studentId: number;
  name: string;          // derived from booking data (subject + count)
  subject: string;
  sessions: number;
  lastSession: string;
  rating: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveStudents(bookings: BookingResponse[]): StudentSummary[] {
  const map = new Map<number, StudentSummary>();
  for (const b of bookings) {
    const id = b.student_id;
    const existing = map.get(id);
    if (existing) {
      existing.sessions += 1;
      if (new Date(b.scheduled_at) > new Date(existing.lastSession)) {
        existing.lastSession = b.scheduled_at;
        existing.subject = b.subject_name ?? existing.subject;
      }
    } else {
      map.set(id, {
        studentId: id,
        name: `Student #${id}`,
        subject: b.subject_name ?? "General",
        sessions: 1,
        lastSession: b.scheduled_at,
        rating: 4.8,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.sessions - a.sessions);
}

// ── Student Card ──────────────────────────────────────────────────────────────

function StudentCard({ student }: { student: StudentSummary }) {
  const date = new Date(student.lastSession).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <View className="bg-white rounded-xl px-4 py-3 mb-3 flex-row items-center gap-3"
      style={{ borderWidth: 1, borderColor: Colors.border }}>
      <View className="w-11 h-11 rounded-full bg-muted items-center justify-center">
        <Ionicons name="person" size={20} color={Colors.deepTeal} />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-sans-bold text-charcoal">{student.name}</Text>
        <Text className="text-[12px] font-sans-medium text-muted-foreground mt-0.5">
          {student.subject} · {student.sessions} {student.sessions === 1 ? "session" : "sessions"}
        </Text>
        <Text className="text-[11px] font-sans-medium text-muted-foreground mt-0.5">
          Last: {date}
        </Text>
      </View>
      <View className="items-end gap-1">
        <View className="flex-row items-center gap-1">
          <Ionicons name="star" size={12} color={Colors.gold} />
          <Text className="text-[12px] font-sans-bold text-charcoal">
            {student.rating.toFixed(1)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.mutedForeground} />
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TutorStudents() {
  const insets = useSafeAreaInsets();
  const [bookings, setBookings]   = useState<BookingResponse[]>([]);
  const [tutorId, setTutorId]     = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState("");

  const load = useCallback(async () => {
    try {
      let id = tutorId;
      if (!id) {
        const p = await getMyTutorProfile();
        id = p.id;
        setTutorId(id);
      }
      const data = await listTutorBookings(id, { page: 1, page_size: 100 });
      setBookings(data.items);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [tutorId]);

  useEffect(() => { load(); }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  const students = useMemo(() => deriveStudents(bookings), [bookings]);

  const filtered = useMemo(() => {
    if (!query.trim()) return students;
    const q = query.toLowerCase();
    return students.filter(
      (s) => s.name.toLowerCase().includes(q) || s.subject.toLowerCase().includes(q)
    );
  }, [students, query]);

  const listPadding = TabBar.height + insets.bottom + Spacing.lg;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-6 pt-5 pb-4">
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-[12px] font-sans-bold text-teal uppercase">Tutor Portal</Text>
            <Text className="text-[24px] font-sans-bold text-charcoal mt-0.5">My Students</Text>
          </View>
          <View className="w-10 h-10 rounded-2xl bg-deep-teal items-center justify-center">
            <Ionicons name="people" size={20} color={Colors.softMint} />
          </View>
        </View>

        {/* Search */}
        <View className="flex-row items-center bg-white rounded-full border border-border px-4 h-11 gap-2">
          <Ionicons name="search-outline" size={16} color={Colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search students…"
            placeholderTextColor={Colors.mutedForeground}
            className="flex-1 text-[13px] font-sans-medium text-charcoal"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={Colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.teal} />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="people-outline" size={40} color={Colors.mutedForeground} />
          <Text className="text-[16px] font-sans-bold text-charcoal mt-4">
            {query ? "No results" : "No students yet"}
          </Text>
          <Text className="text-[13px] font-sans-medium text-muted-foreground mt-1 text-center">
            {query ? "Try a different search term." : "Students who book sessions will appear here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => String(s.studentId)}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.teal} colors={[Colors.teal]} />}
          contentContainerStyle={{
            paddingHorizontal: Spacing.xl,
            paddingBottom: listPadding,
          }}
          ListHeaderComponent={
            <Text className="text-[12px] font-sans-semibold text-muted-foreground mb-3">
              {filtered.length} {filtered.length === 1 ? "student" : "students"}
            </Text>
          }
          renderItem={({ item }) => <StudentCard student={item} />}
        />
      )}
    </SafeAreaView>
  );
}
