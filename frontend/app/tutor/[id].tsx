import { useEffect, useState, useCallback } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants";
import {
  getTutor,
  type TutorDetail,
} from "@/lib/api/tutors";
import { formatCurrency } from "@/lib/api/bookings";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { LoadingState, ScreenFade } from "@/components/ui/Motion";

import StatBadge from "@/components/tutor/StatBadge";

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

function modeLabel(mode: string): string {
  if (mode === "online") return "Online";
  if (mode === "in_person") return "In Person";
  return "Online & In Person";
}

/* ─────────────────────────────────────────────
   Subject Chip
───────────────────────────────────────────── */

function SubjectChip({ name }: { name: string }) {
  return (
    <View style={styles.subjectChip}>
      <Text style={styles.subjectChipText}>
        {name}
      </Text>
    </View>
  );
}

/* ─────────────────────────────────────────────
   Section Title
───────────────────────────────────────────── */

function SectionTitle({ title }: { title: string }) {
  return (
    <Text style={styles.sectionTitle}>
      {title}
    </Text>
  );
}

/* ─────────────────────────────────────────────
   Screen
───────────────────────────────────────────── */

export default function TutorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tutorId = Number(id);

  const [tutor, setTutor] = useState<TutorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  /* ───────────────────────────────────────────
     Fetch Tutor
  ─────────────────────────────────────────── */

  const fetchTutor = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const data = await getTutor(tutorId);
      setTutor(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [tutorId]);

  useEffect(() => {
    fetchTutor();
  }, [fetchTutor]);

  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      await fetchTutor();
    }, [fetchTutor])
  );

  /* ───────────────────────────────────────────
     Loading
  ─────────────────────────────────────────── */

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={{ width: "100%", maxWidth: 470 }}>
          <LoadingState />
        </View>
      </SafeAreaView>
    );
  }

  /* ───────────────────────────────────────────
     Error
  ─────────────────────────────────────────── */

  if (error || !tutor) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <Ionicons
          name="alert-circle-outline"
          size={44}
          color={Colors.mutedForeground}
        />

        <Text className="mt-3 text-[14px] font-sans-semibold text-muted-foreground">
          Could not load tutor profile
        </Text>

        <Pressable
          onPress={fetchTutor}
          className="mt-5 px-6 py-3 rounded-lg bg-deep-teal active:opacity-80"
        >
          <Text className="text-[13px] font-sans-bold text-white">
            Retry
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  /* ───────────────────────────────────────────
     Derived values
  ─────────────────────────────────────────── */

  const rate = parseFloat(tutor.rate_per_hour);
  const rating = parseFloat(tutor.average_rating);
  const isVerified = tutor.verification_status === "verified";
  const subjects = tutor.subjects ?? [];
  const tutorSubjects = tutor.tutor_subjects ?? [];
  const primarySubject = subjects[0]?.name ?? "Tutor";
  const subjectNames = tutorSubjects.length > 0
    ? tutorSubjects.map((ts) => ts.subject.name)
    : subjects.map((subject) => subject.name);
  const openBooking = () => {
    router.push({
      pathname: `/booking/${tutor.id}/slot` as any,
      params: {
        tutorId: String(tutor.id),
        displayName: tutor.display_name,
        ratePerHour: tutor.rate_per_hour,
        currency: tutor.currency,
        teachingMode: tutor.teaching_mode,
        availabilitySlots: JSON.stringify(tutor.availability_slots),
        tutorSubjects: JSON.stringify(tutor.tutor_subjects),
        primarySubject: primarySubject,
      },
    });
  };

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top"]}
    >
      {/* ═══════════════════════════════════════
          TOP NAVIGATION
      ═══════════════════════════════════════ */}

      <View style={styles.topBar}>
        <View style={styles.topBarInner}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backButton}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={Colors.charcoal}
            />
          </Pressable>

          <Text style={styles.topTitle}>Tutor profile</Text>
          <View style={styles.backButton} />
        </View>
      </View>

      {/* ═══════════════════════════════════════
          SCROLLABLE CONTENT
      ═══════════════════════════════════════ */}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.teal}
            colors={[Colors.teal]}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 72,
          paddingTop: 2,
          width: "100%",
          maxWidth: 470,
          alignSelf: "center",
        }}
      >
        <ScreenFade>
        {/* ═══════════════════════════════════════
            PROFILE HEADER
        ═══════════════════════════════════════ */}

        <View style={styles.profileCard}>
          {/* Avatar */}

          <View
            className="rounded-full bg-white"
            style={{
              padding: 3,
              shadowColor: Colors.charcoal,
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.12,
              shadowRadius: 7,
              elevation: 4,
            }}
          >
            {tutor.profile_image_url ? (
              <Image
                source={{
                  uri: tutor.profile_image_url,
                }}
                className="w-[88px] h-[88px] rounded-full"
              />
            ) : (
              <View className="w-[88px] h-[88px] rounded-full bg-muted items-center justify-center">
                <Ionicons
                  name="person"
                  size={40}
                  color={Colors.mutedForeground}
                />
              </View>
            )}
          </View>

          {/* Tutor information */}

          <View className="flex-1 ml-4">
            {/* Verified */}

            {isVerified && (
              <View className="flex-row items-center mb-1">
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color={Colors.teal}
                />

                <Text className="text-[11px] font-sans-semibold text-teal ml-1">
                  Verified Tutor
                </Text>
              </View>
            )}

            {/* Name */}

            <Text
              className="text-[20px] font-sans-bold text-charcoal"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {tutor.display_name}
            </Text>

            {/* Subject */}

            <View className="flex-row items-center mt-1">
              <Ionicons
                name="school-outline"
                size={13}
                color={Colors.mutedForeground}
              />

              <Text className="text-[12px] font-sans-medium text-muted-foreground ml-1">
                {primarySubject} Tutor
              </Text>
            </View>

            {/* Rating */}

            <View className="flex-row items-center mt-1.5">
              <Ionicons
                name="star"
                size={13}
                color={Colors.gold}
              />

              <Text className="text-[12px] font-sans-bold text-charcoal ml-1">
                {rating.toFixed(1)}
              </Text>

              <Text className="text-[11px] font-sans-medium text-muted-foreground ml-1">
                ({tutor.review_count} reviews)
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bookingPanel}>
          <View style={styles.bookingPanelTop}>
            <View style={styles.pricePill}>
              <Text style={styles.priceText} numberOfLines={1}>
                {formatCurrency(rate, tutor.currency, 0)}
              </Text>
              <Text style={styles.priceSuffix}>/hr</Text>
            </View>

            <View style={styles.modePill}>
              <Ionicons
                name={
                  tutor.teaching_mode === "online"
                    ? "videocam-outline"
                    : tutor.teaching_mode === "in_person"
                    ? "location-outline"
                    : "swap-horizontal-outline"
                }
                size={15}
                color={Colors.deepTeal}
              />
              <Text style={styles.modePillText} numberOfLines={1}>
                {modeLabel(tutor.teaching_mode)}
              </Text>
            </View>
          </View>

          <Text style={styles.bookingTitle}>Ready to start with {tutor.display_name.split(" ")[0] ?? "this tutor"}?</Text>
          <Text style={styles.bookingCopy}>Pick your subject, choose a time, and confirm the lesson.</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Book a session with ${tutor.display_name}`}
            onPress={openBooking}
            style={({ pressed }) => [styles.bookButton, pressed && { opacity: 0.78 }]}
          >
            <Text style={styles.bookButtonText}>Book now</Text>
            <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* ═══════════════════════════════════════
            STATS
        ═══════════════════════════════════════ */}

        <View style={styles.statsCard}>
          <StatBadge
            value={`${tutor.years_of_experience}+`}
            label="Years Exp."
          />

          <StatBadge
            value={`${tutor.total_hours_taught}+`}
            label="Hours taught"
            divider
          />

          <StatBadge
            value={rating.toFixed(1)}
            label="Rating"
            divider
          />
        </View>

        {/* ═══════════════════════════════════════
            ABOUT
        ═══════════════════════════════════════ */}

        <View style={styles.infoCard}>
          <SectionTitle title="About" />
          <Text style={styles.infoText}>
            {tutor.bio || `${tutor.display_name} is preparing their tutor profile. You can still book a lesson and confirm fit in chat.`}
          </Text>
        </View>

        {/* ═══════════════════════════════════════
            SUBJECTS OF EXPERTISE
        ═══════════════════════════════════════ */}

        <View style={styles.infoCard}>
          <SectionTitle title="Subjects" />

          <View style={styles.subjectList}>
            {subjectNames.length > 0 ? (
              subjectNames.map((name) => (
                <SubjectChip
                  key={name}
                  name={name}
                />
              ))
            ) : (
              <Text style={styles.infoText}>Subjects will appear here after this tutor updates their profile.</Text>
            )}
          </View>
        </View>

        {/* ═══════════════════════════════════════
            QUALIFICATIONS
        ═══════════════════════════════════════ */}

        <View style={styles.infoCard}>
          <SectionTitle title="Qualifications" />

          <Text style={styles.infoText}>
            {tutor.qualifications || "Qualifications have not been added yet."}
          </Text>
        </View>

        {/* ═══════════════════════════════════════
            SESSION FORMAT
        ═══════════════════════════════════════ */}

        <View style={[styles.infoCard, styles.lastInfoCard]}>
          <SectionTitle title="Session format" />
          <View style={styles.formatRow}>
            <View style={styles.formatIcon}>
              <Ionicons
                name={
                  tutor.teaching_mode === "online"
                    ? "videocam-outline"
                    : tutor.teaching_mode === "in_person"
                    ? "person-outline"
                    : "swap-horizontal-outline"
                }
                size={17}
                color={Colors.deepTeal}
              />
            </View>

            <Text style={styles.formatText}>
              {modeLabel(tutor.teaching_mode)}
            </Text>
          </View>
        </View>

        </ScreenFade>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },
  topBar: {
    borderBottomWidth: 1,
    borderBottomColor: "#C8D0DD",
    backgroundColor: Colors.card,
  },
  topBarInner: {
    width: "100%",
    maxWidth: 470,
    minHeight: 54,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontFamily: "sans-bold",
    fontSize: 17,
    color: Colors.deepTeal,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 14,
    padding: 18,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "#C8D0DD",
    shadowColor: Colors.deepTeal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  subjectChip: {
    minHeight: 32,
    borderRadius: 999,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subjectChipText: {
    fontFamily: "sans-semibold",
    fontSize: 11,
    color: Colors.deepTeal,
  },
  sectionTitle: {
    marginBottom: 10,
    fontFamily: "sans-bold",
    fontSize: 16,
    color: Colors.deepTeal,
  },
  bookingPanel: {
    marginBottom: 18,
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#D3FAF3",
    borderWidth: 1,
    borderColor: "#74D9CF",
    gap: 12,
    shadowColor: Colors.deepTeal,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  bookingPanelTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pricePill: {
    height: 38,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priceText: {
    fontFamily: "sans-bold",
    fontSize: 16,
    lineHeight: 20,
    color: Colors.deepTeal,
  },
  priceSuffix: {
    marginLeft: 3,
    fontFamily: "sans-medium",
    fontSize: 11,
    lineHeight: 15,
    color: Colors.mutedForeground,
  },
  modePill: {
    minHeight: 38,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modePillText: {
    fontFamily: "sans-semibold",
    fontSize: 12,
    color: Colors.deepTeal,
  },
  bookingTitle: {
    fontFamily: "sans-bold",
    fontSize: 18,
    lineHeight: 23,
    color: Colors.deepTeal,
  },
  bookingCopy: {
    marginTop: -6,
    fontFamily: "sans-medium",
    fontSize: 13,
    lineHeight: 19,
    color: Colors.mutedForeground,
  },
  bookButton: {
    minHeight: 52,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 20,
    backgroundColor: Colors.deepTeal,
  },
  bookButtonText: {
    fontFamily: "sans-bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  statsCard: {
    flexDirection: "row",
    borderRadius: 8,
    paddingVertical: 12,
    marginBottom: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "#C8D0DD",
    shadowColor: Colors.deepTeal,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 1,
  },
  infoCard: {
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "#C8D0DD",
    shadowColor: Colors.deepTeal,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 1,
  },
  lastInfoCard: {
    marginBottom: 0,
  },
  infoText: {
    fontFamily: "sans-medium",
    fontSize: 13,
    lineHeight: 20,
    color: Colors.foreground,
  },
  subjectList: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  formatRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  formatIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.paleTeal,
  },
  formatText: {
    flex: 1,
    fontFamily: "sans-bold",
    fontSize: 14,
    color: Colors.deepTeal,
  },
});
