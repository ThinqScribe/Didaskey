import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants";
import {
  getTutor,
  getTutorReviews,
  type TutorDetail,
  type Review,
} from "@/lib/api/tutors";
import { formatCurrency } from "@/lib/api/bookings";
import { useRefresh } from "@/lib/hooks/useRefresh";

import StatBadge from "@/components/tutor/StatBadge";
import ReviewCard from "@/components/tutor/ReviewCard";

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
    <View className="rounded-lg border border-border px-3 py-1.5 mr-2 mb-2" style={{ backgroundColor: Colors.background }}>
      <Text className="text-[11px] font-sans-medium text-charcoal">
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
    <Text className="text-[14px] font-sans-bold text-charcoal mb-2">
      {title}
    </Text>
  );
}

/* ─────────────────────────────────────────────
   Divider
───────────────────────────────────────────── */

function Divider() {
  return <View className="h-px bg-border my-4" />;
}

/* ─────────────────────────────────────────────
   Screen
───────────────────────────────────────────── */

export default function TutorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tutorId = Number(id);

  const [tutor, setTutor] = useState<TutorDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
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

  /* ───────────────────────────────────────────
     Fetch Reviews
  ─────────────────────────────────────────── */

  const fetchReviews = useCallback(async () => {
    setLoadingReviews(true);

    try {
      const data = await getTutorReviews(tutorId, 1, 5);
      setReviews(data.items);
    } catch {
      setReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  }, [tutorId]);

  useEffect(() => {
    fetchTutor();
    fetchReviews();
  }, [fetchTutor, fetchReviews]);

  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      await Promise.all([fetchTutor(), fetchReviews()]);
    }, [fetchTutor, fetchReviews])
  );

  /* ───────────────────────────────────────────
     Loading
  ─────────────────────────────────────────── */

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <ActivityIndicator size="small" color={Colors.teal} />
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
          className="mt-5 px-6 py-3 rounded-full bg-deep-teal active:opacity-80"
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

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "bottom"]}
    >
      {/* ═══════════════════════════════════════
          TOP NAVIGATION
      ═══════════════════════════════════════ */}

      <View className="flex-row items-center justify-between px-5 py-2" style={{ width: "100%", maxWidth: 760, alignSelf: "center" }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="w-9 h-9 items-center justify-center"
        >
          <Ionicons
            name="chevron-back"
            size={23}
            color={Colors.charcoal}
          />
        </Pressable>

        <Text className="text-[12px] font-sans-bold text-teal">TUTOR PROFILE</Text>
      </View>

      {/* ═══════════════════════════════════════
          SCROLLABLE CONTENT
      ═══════════════════════════════════════ */}

      <ScrollView
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
          paddingBottom: 110,
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        }}
      >
        {/* ═══════════════════════════════════════
            PROFILE HEADER
        ═══════════════════════════════════════ */}

        <View className="flex-row items-center mt-2 mb-5 p-5 rounded-[28px] bg-card border border-border">
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

        {/* ═══════════════════════════════════════
            STATS
        ═══════════════════════════════════════ */}

        <View className="flex-row py-3 border-t border-b border-border">
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

        {!!tutor.bio && (
          <>
            <View className="pt-5">
              <SectionTitle title="About" />

              <Text
                className="text-[12px] font-sans-medium text-charcoal leading-[18px]"
                numberOfLines={4}
              >
                {tutor.bio}
              </Text>
            </View>

            <Divider />
          </>
        )}

        {/* ═══════════════════════════════════════
            SUBJECTS OF EXPERTISE
        ═══════════════════════════════════════ */}

        {(tutorSubjects.length > 0 || subjects.length > 0) && (
          <>
            <SectionTitle title="Subjects" />

            <View className="flex-row flex-wrap">
              {tutorSubjects.length > 0
                ? tutorSubjects.map((ts) => (
                    <SubjectChip
                      key={ts.subject_id}
                      name={ts.subject.name}
                    />
                  ))
                : subjects.map((s) => (
                    <SubjectChip key={s.id} name={s.name} />
                  ))}
            </View>

            <Divider />
          </>
        )}

        {/* ═══════════════════════════════════════
            QUALIFICATIONS
        ═══════════════════════════════════════ */}

        {!!tutor.qualifications && (
          <>
            <SectionTitle title="Qualifications" />

            <Text className="text-[12px] font-sans-medium text-charcoal leading-[18px]">
              {tutor.qualifications}
            </Text>

            <Divider />
          </>
        )}

        {/* ═══════════════════════════════════════
            SESSION FORMAT
        ═══════════════════════════════════════ */}

        <SectionTitle title="Session Format" />

        <View className="flex-row items-center">
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

          <Text className="text-[12px] font-sans-semibold text-charcoal ml-2">
            {modeLabel(tutor.teaching_mode)}
          </Text>
        </View>

        <Divider />

        {/* ═══════════════════════════════════════
            REVIEWS
        ═══════════════════════════════════════ */}

        <SectionTitle
          title={`Reviews${
            tutor.review_count > 0
              ? ` (${tutor.review_count})`
              : ""
          }`}
        />

        {loadingReviews ? (
          <View className="py-8 items-center">
            <ActivityIndicator
              size="small"
              color={Colors.teal}
            />
          </View>
        ) : reviews.length === 0 ? (
          <View className="py-6 items-center">
            <Text className="text-[12px] font-sans-medium text-muted-foreground">
              No reviews yet
            </Text>
          </View>
        ) : (
          <View className="mt-1">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ═══════════════════════════════════════
          STICKY BOOKING BAR
      ═══════════════════════════════════════ */}

      <View
        className="absolute bottom-0 left-0 right-0 bg-card"
        style={{
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 14,
        }}
      >
        <View className="flex-row items-center justify-between" style={{ width: "100%", maxWidth: 760, alignSelf: "center" }}>
          {/* Price */}

          <View className="flex-row items-baseline">
            <Text className="text-[20px] font-sans-bold text-charcoal">
              {formatCurrency(rate, tutor.currency, 0)}
            </Text>

            <Text className="text-[11px] font-sans-medium text-muted-foreground ml-1">
              / hour
            </Text>
          </View>

          {/* Book */}

          <Pressable
            className="rounded-full bg-deep-teal px-7 py-3.5 active:opacity-80"
            onPress={() =>
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
              })
            }
          >
            <Text className="text-[13px] font-sans-bold text-white">
              Book a Session
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
