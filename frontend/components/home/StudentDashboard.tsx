import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Colors, TabBar } from "@/constants";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { useAuthStore } from "@/lib/store/auth";
import { getProgress, type Progress } from "@/lib/api/learning";
import {
  formatBookingTimeRange,
  listBookings,
  type BookingResponse,
} from "@/lib/api/bookings";
import {
  getSubjects,
  searchTutors,
  type Subject,
  type TutorSummary,
} from "@/lib/api/tutors";

const SUBJECT_TINTS = ["#D3FAF3", "#E9F0FA", "#FFF4D8", "#E7FAF1", "#FCE8E8"];
const LIME = "#BFFF4B";
const NAVY = "#071D3A";
const HEADER_NAVY = "#061E3D";
const MUTED_NAVY = "#63708C";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(displayName?: string | null) {
  const trimmed = displayName?.trim();
  if (!trimmed) return "learner";
  return trimmed.split(/\s+/)[0];
}

function formatMonthDay(isoString: string) {
  const date = new Date(isoString);
  return {
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.toLocaleDateString("en-US", { day: "2-digit" }),
  };
}

function subjectIcon(subject: Subject, index: number): keyof typeof Ionicons.glyphMap {
  const name = subject.name.toLowerCase();
  if (subject.icon_name) return subject.icon_name as keyof typeof Ionicons.glyphMap;
  if (name.includes("bio")) return "leaf-outline";
  if (name.includes("chem")) return "flask-outline";
  if (name.includes("math")) return "bar-chart-outline";
  if (name.includes("economic") || name.includes("business")) return "trending-up-outline";
  if (name.includes("english") || name.includes("literature")) return "book-outline";
  const fallback: (keyof typeof Ionicons.glyphMap)[] = [
    "school-outline",
    "calculator-outline",
    "planet-outline",
    "pencil-outline",
    "library-outline",
  ];
  return fallback[index % fallback.length];
}

function ProgressRing({ hours }: { hours: number }) {
  const size = 50;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0.18, Math.min(hours / 5, 1));

  return (
    <View style={styles.ringWrap} accessibilityLabel={`${hours} hours learned this week`}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={stroke}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={LIME}
          strokeWidth={stroke}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          rotation="-82"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    </View>
  );
}

function Header({
  avatarUrl,
  name,
  learningHours,
}: {
  avatarUrl?: string | null;
  name: string;
  learningHours: number;
}) {
  return (
    <View style={styles.headerOuter}>
      <SafeAreaView edges={["top"]} style={styles.headerSafe}>
        <View style={styles.headerInner}>
          <View style={styles.headerTop}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.headerCopy}>
              <Text style={styles.greeting}>{greeting()}</Text>
              <Text style={styles.headerTitle} numberOfLines={2}>
                Ready to learn, {name}?
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
              onPress={() => router.push("/notifications")}
              style={({ pressed }) => [styles.bellButton, pressed && styles.pressed]}
            >
              <Ionicons name="notifications-outline" size={22} color="#FFFFFF" />
              <View style={styles.notificationDot} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Pressable
              accessibilityRole="search"
              onPress={() => router.push("/(tabs)/search")}
              style={({ pressed }) => [styles.searchBox, pressed && styles.pressed]}
            >
              <Ionicons name="search-outline" size={22} color="#FFFFFF" />
              <Text style={styles.searchText} numberOfLines={1}>
                Search anything you want to learn
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open search filters"
              onPress={() => router.push("/(tabs)/search")}
              style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
            >
              <Ionicons name="options-outline" size={22} color={NAVY} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            <ProgressRing hours={learningHours} />
            <View style={styles.weekCopy}>
              <Text style={styles.weekHours}>{learningHours}h</Text>
              <Text style={styles.weekText}>this week</Text>
            </View>
            <View style={styles.noteWrap}>
              <Text style={styles.noteText}>On track</Text>
              <View style={styles.noteUnderline} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        hitSlop={8}
        style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
      >
        <Text style={styles.sectionActionText}>{action}</Text>
        <Ionicons name="chevron-forward" size={24} color={NAVY} />
      </Pressable>
    </View>
  );
}

function UpNext({ booking }: { booking: BookingResponse | undefined }) {
  if (!booking) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(tabs)/search")}
        style={({ pressed }) => [styles.emptyNext, pressed && styles.pressed]}
      >
        <View style={styles.emptyNextIcon}>
          <Ionicons name="calendar-outline" size={24} color={NAVY} />
        </View>
        <View style={styles.emptyNextCopy}>
          <Text style={styles.nextSubject}>Book your next lesson</Text>
          <Text style={styles.nextMeta}>Find a tutor and reserve a slot.</Text>
        </View>
        <View style={styles.nextArrow}>
          <Ionicons name="arrow-forward" size={28} color="#FFFFFF" />
        </View>
      </Pressable>
    );
  }

  const date = formatMonthDay(booking.scheduled_at);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/learning/${booking.id}`)}
      style={({ pressed }) => [styles.nextCard, pressed && styles.pressed]}
    >
      <View style={styles.dateTile}>
        <Text style={styles.dateMonth}>{date.month}</Text>
        <Text style={styles.dateDay}>{date.day}</Text>
      </View>
      <View style={styles.nextDivider} />
      <View style={styles.nextCopy}>
        <Text style={styles.nextSubject} numberOfLines={1}>
          {booking.subject_name ?? "Tutoring"}
        </Text>
        <Text style={styles.nextTutor} numberOfLines={1}>
          {booking.tutor_name}
        </Text>
        <Text style={styles.nextTime}>
          {formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}
        </Text>
      </View>
      <View style={styles.onlineBadge}>
        <Ionicons
          name={booking.session_format === "online" ? "videocam" : "location"}
          size={13}
          color={NAVY}
        />
        <Text style={styles.onlineText}>
          {booking.session_format === "online" ? "ONLINE" : "IN PERSON"}
        </Text>
      </View>
      <View style={styles.nextDivider} />
      <View style={styles.nextArrow}>
        <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

function Momentum({ progress }: { progress: Progress | null }) {
  const learningHours = Math.round((progress?.learning_minutes ?? 0) / 60);
  const items = [
    { value: String(progress?.completed_sessions ?? 0), label: "Lesson done" },
    { value: String(progress?.pending ?? 0), label: "To complete" },
    { value: `${learningHours}h`, label: "Learning time" },
  ];

  return (
    <View style={styles.momentum}>
      <View style={styles.momentumHead}>
        <Text style={styles.momentumTitle}>Your momentum</Text>
        <View style={styles.keepGoing}>
          <Ionicons name="trending-up" size={22} color="#005A45" />
          <Text style={styles.keepGoingText}>Keep going</Text>
        </View>
      </View>
      <View style={styles.momentumStats}>
        {items.map((item, index) => (
          <View key={item.label} style={styles.momentumItem}>
            <Text style={styles.momentumValue}>{item.value}</Text>
            <Text style={styles.momentumLabel}>{item.label}</Text>
            {index < items.length - 1 && <View style={styles.statDivider} />}
          </View>
        ))}
      </View>
    </View>
  );
}

function SubjectTile({
  subject,
  index,
  active,
  onPress,
}: {
  subject: Subject;
  index: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.subjectTile,
        { backgroundColor: SUBJECT_TINTS[index % SUBJECT_TINTS.length] },
        active && styles.subjectTileActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.subjectIconWrap, active && styles.subjectIconWrapActive]}>
        <Ionicons
          name={subjectIcon(subject, index)}
          size={22}
          color={active ? "#FFFFFF" : NAVY}
        />
      </View>
      <Text style={[styles.subjectName, active && styles.subjectNameActive]} numberOfLines={1}>
        {subject.name}
      </Text>
    </Pressable>
  );
}

function TutorTile({ tutor }: { tutor: TutorSummary }) {
  const primarySubject = tutor.subjects[0]?.name ?? "General";
  const rating = Number.parseFloat(tutor.average_rating || "0");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${tutor.display_name}`}
      onPress={() => router.push(`/tutor/${tutor.id}`)}
      style={({ pressed }) => [styles.tutorTile, pressed && styles.pressed]}
    >
      {tutor.profile_image_url ? (
        <Image source={{ uri: tutor.profile_image_url }} style={styles.tutorImage} />
      ) : (
        <View style={styles.tutorFallback}>
          <Ionicons name="person" size={36} color={MUTED_NAVY} />
        </View>
      )}
      <View style={styles.tutorInfo}>
        <Text style={styles.tutorName} numberOfLines={1}>
          {tutor.display_name}
        </Text>
        <Text style={styles.tutorSubject} numberOfLines={1}>
          {primarySubject}
        </Text>
        <View style={styles.tutorFooter}>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={17} color="#F4B321" />
            <Text style={styles.ratingText}>{Number.isFinite(rating) ? rating.toFixed(1) : "New"}</Text>
          </View>
          <View style={styles.viewPill}>
            <Text style={styles.viewText}>View</Text>
            <Ionicons name="chevron-forward" size={16} color={NAVY} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

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
      searchTutors({ subject_id: subjectId ?? undefined, page: 1, page_size: 8 }),
      listBookings({ page: 1, page_size: 50 }),
      getProgress(),
    ]);

    if (results[0].status === "fulfilled") setSubjects(results[0].value);
    if (results[1].status === "fulfilled") setTutors(results[1].value.items);
    if (results[2].status === "fulfilled") setBookings(results[2].value.items);
    if (results[3].status === "fulfilled") setProgress(results[3].value);
    if (results.some(result => result.status === "rejected")) {
      setError("Some dashboard updates could not load. Pull down to try again.");
    }
    setLoading(false);
  }, [activeSubject]);

  useEffect(() => {
    void load();
  }, [load]);

  const { refreshing, onRefresh } = useRefresh(load);
  const name = firstName(user?.first_name);
  const learningHours = Math.round((progress?.learning_minutes ?? 0) / 60);
  const upcoming = useMemo(
    () => bookings
      .filter(b => b.status === "confirmed" && new Date(b.scheduled_at) > new Date())
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0],
    [bookings],
  );

  const toggleSubject = (id: number) => {
    setActiveSubject(current => current === id ? null : id);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={LIME} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        <Header avatarUrl={user?.profile_image_url} name={name} learningHours={learningHours} />

        <View style={styles.body}>
          <SectionTitle title="Up next" action="View schedule" onPress={() => router.push("/(tabs)/bookings")} />
          <UpNext booking={upcoming} />

          <Momentum progress={progress} />

          <SectionTitle title="Pick a subject" action="See all" onPress={() => router.push("/(tabs)/search")} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subjectList}
          >
            {subjects.slice(0, 10).map((subject, index) => (
              <SubjectTile
                key={subject.id}
                subject={subject}
                index={index}
                active={activeSubject === subject.id}
                onPress={() => toggleSubject(subject.id)}
              />
            ))}
          </ScrollView>

          <SectionTitle title="Top tutors for you" action="Browse all" onPress={() => router.push("/(tabs)/search")} />
          {loading ? (
            <ActivityIndicator color={Colors.teal} style={styles.loader} />
          ) : tutors.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tutorList}
            >
              {tutors.map(tutor => <TutorTile key={tutor.id} tutor={tutor} />)}
            </ScrollView>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/search")}
              style={({ pressed }) => [styles.noTutors, pressed && styles.pressed]}
            >
              <Ionicons name="people-outline" size={28} color={NAVY} />
              <View style={styles.noTutorsCopy}>
                <Text style={styles.noTutorsTitle}>No tutors here yet</Text>
                <Text style={styles.noTutorsText}>Try another subject or browse every tutor.</Text>
              </View>
              <Ionicons name="arrow-forward" size={24} color={NAVY} />
            </Pressable>
          )}

          {!!error && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: TabBar.height + 28,
  },
  headerOuter: {
    backgroundColor: Colors.background,
  },
  headerSafe: {
    overflow: "hidden",
    borderBottomRightRadius: 34,
    backgroundColor: HEADER_NAVY,
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  headerInner: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#D9E1E7",
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DDE7EE",
  },
  avatarInitial: {
    fontFamily: "sans-bold",
    fontSize: 19,
    color: NAVY,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    textTransform: "uppercase",
    fontFamily: "sans-semibold",
    fontSize: 11,
    color: "#B8C3D9",
  },
  headerTitle: {
    marginTop: 4,
    fontFamily: "sans-bold",
    fontSize: 25,
    lineHeight: 29,
    color: "#FFFFFF",
  },
  bellButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationDot: {
    position: "absolute",
    right: 6,
    top: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: LIME,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
  searchBox: {
    flex: 1,
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  searchText: {
    flex: 1,
    fontFamily: "sans-medium",
    fontSize: 14,
    color: "#B9C5D8",
  },
  filterButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LIME,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  ringWrap: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  weekCopy: {
    marginLeft: 8,
  },
  weekHours: {
    fontFamily: "sans-bold",
    fontSize: 23,
    lineHeight: 26,
    color: "#FFFFFF",
  },
  weekText: {
    fontFamily: "sans-medium",
    fontSize: 14,
    color: "#C8D0EC",
  },
  noteWrap: {
    marginLeft: "auto",
    marginRight: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(211,250,243,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  noteText: {
    fontFamily: "sans-bold",
    fontSize: 13,
    lineHeight: 15,
    color: "#D3FAF3",
  },
  noteUnderline: {
    width: 44,
    height: 2,
    borderRadius: 2,
    marginTop: 6,
    backgroundColor: LIME,
  },
  body: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    paddingHorizontal: 15,
    paddingTop: 18,
  },
  sectionHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: "sans-bold",
    fontSize: 22,
    lineHeight: 27,
    color: NAVY,
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionActionText: {
    fontFamily: "sans-medium",
    fontSize: 14,
    color: NAVY,
  },
  nextCard: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  emptyNext: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    backgroundColor: Colors.card,
    padding: 12,
    marginBottom: 18,
  },
  emptyNextIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LIME,
  },
  emptyNextCopy: {
    flex: 1,
    minWidth: 0,
  },
  dateTile: {
    width: 54,
    height: 64,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LIME,
  },
  dateMonth: {
    fontFamily: "sans-bold",
    fontSize: 11,
    color: NAVY,
  },
  dateDay: {
    marginTop: 1,
    fontFamily: "sans-bold",
    fontSize: 26,
    lineHeight: 28,
    color: NAVY,
  },
  nextDivider: {
    width: 1,
    height: 58,
    backgroundColor: "rgba(7,29,58,0.18)",
  },
  nextCopy: {
    flex: 1,
    minWidth: 0,
  },
  nextSubject: {
    fontFamily: "sans-bold",
    fontSize: 17,
    lineHeight: 21,
    color: NAVY,
  },
  nextTutor: {
    marginTop: 3,
    fontFamily: "sans-regular",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  nextMeta: {
    marginTop: 4,
    fontFamily: "sans-regular",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  nextTime: {
    marginTop: 4,
    fontFamily: "sans-medium",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  onlineBadge: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#C9FAEF",
  },
  onlineText: {
    fontFamily: "sans-bold",
    fontSize: 11,
    color: NAVY,
  },
  nextArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NAVY,
  },
  momentum: {
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
    backgroundColor: "#C9FAEF",
  },
  momentumHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  momentumTitle: {
    flex: 1,
    fontFamily: "sans-bold",
    fontSize: 20,
    color: NAVY,
  },
  keepGoing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  keepGoingText: {
    fontFamily: "sans-bold",
    fontSize: 13,
    color: "#005A45",
  },
  momentumStats: {
    flexDirection: "row",
    marginTop: 14,
  },
  momentumItem: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  momentumValue: {
    fontFamily: "sans-bold",
    fontSize: 28,
    lineHeight: 31,
    color: NAVY,
  },
  momentumLabel: {
    marginTop: 4,
    fontFamily: "sans-regular",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  statDivider: {
    position: "absolute",
    right: 8,
    top: 5,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(7,29,58,0.2)",
  },
  subjectList: {
    gap: 8,
    paddingRight: 16,
    marginBottom: 22,
  },
  subjectTile: {
    minWidth: 104,
    height: 48,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: 8,
    paddingRight: 12,
    gap: 8,
  },
  subjectTileActive: {
    backgroundColor: "#071D3A",
  },
  subjectIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  subjectIconWrapActive: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  subjectName: {
    fontFamily: "sans-semibold",
    fontSize: 13,
    lineHeight: 16,
    color: NAVY,
    maxWidth: 120,
  },
  subjectNameActive: {
    color: "#FFFFFF",
  },
  tutorList: {
    gap: 12,
    paddingRight: 16,
  },
  tutorTile: {
    width: 220,
    minHeight: 116,
    borderRadius: 8,
    backgroundColor: Colors.card,
    flexDirection: "row",
    alignItems: "center",
    padding: 11,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.06)",
  },
  tutorImage: {
    width: 70,
    height: 84,
    borderRadius: 8,
    backgroundColor: "#DFE4E5",
  },
  tutorFallback: {
    width: 70,
    height: 84,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6E4DE",
  },
  tutorInfo: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  tutorName: {
    fontFamily: "sans-bold",
    fontSize: 15,
    color: NAVY,
  },
  tutorSubject: {
    marginTop: 6,
    fontFamily: "sans-regular",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  tutorFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 10,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  ratingText: {
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: NAVY,
  },
  viewPill: {
    minHeight: 30,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingLeft: 11,
    paddingRight: 8,
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
  },
  viewText: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: NAVY,
  },
  noTutors: {
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.card,
  },
  noTutorsCopy: {
    flex: 1,
    minWidth: 0,
  },
  noTutorsTitle: {
    fontFamily: "sans-bold",
    fontSize: 17,
    color: NAVY,
  },
  noTutorsText: {
    marginTop: 4,
    fontFamily: "sans-regular",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  loader: {
    paddingVertical: 28,
  },
  error: {
    marginTop: 18,
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#FFF0E9",
    fontFamily: "sans-medium",
    fontSize: 13,
    color: "#9D3128",
  },
  pressed: {
    opacity: 0.72,
  },
});
