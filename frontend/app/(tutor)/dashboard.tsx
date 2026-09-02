import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Spacing, TabBar } from "@/constants";
import { useAuthStore } from "@/lib/store/auth";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { formatCurrency, formatBookingDate, formatBookingTimeRange, type BookingResponse } from "@/lib/api/bookings";
import { getMyTutorProfile, listTutorBookings, computeStats, type TutorStats } from "@/lib/api/tutor-portal";
import type { TutorDetail } from "@/lib/api/tutors";

// ── Sub-components ────────────────────────────────────────────────────────────

function WeekStatCard({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center py-3">
      <Text className="text-[17px] font-sans-bold text-white">{value}</Text>
      <Text className="text-[10px] font-sans-medium mt-0.5" style={{ color: `${Colors.softMint}99` }}>
        {label}
      </Text>
    </View>
  );
}

function UpcomingCard({ booking }: { booking: BookingResponse }) {
  const time = new Date(booking.scheduled_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const isOnline = booking.session_format === "online";

  return (
    <View className="flex-row items-center py-3 border-b border-border">
      <View className="w-8 h-8 rounded-tr-xl rounded-bl-xl bg-muted items-center justify-center mr-3">
        <Ionicons name="school-outline" size={15} color={Colors.deepTeal} />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-sans-bold text-charcoal" numberOfLines={1}>
          {booking.subject_name ?? "General session"}
        </Text>
        <Text className="text-[11px] font-sans-medium text-muted-foreground">
          {formatBookingDate(booking.scheduled_at)} · {time}
        </Text>
      </View>
      <View
        className="rounded-full px-2.5 py-1"
        style={{ backgroundColor: isOnline ? `${Colors.teal}15` : `${Colors.gold}15` }}
      >
        <Text className="text-[10px] font-sans-bold" style={{ color: isOnline ? Colors.teal : Colors.gold }}>
          {isOnline ? "Online" : "In-Person"}
        </Text>
      </View>
    </View>
  );
}

function RecentActivityCard({ booking }: { booking: BookingResponse }) {
  const earned = parseFloat(booking.amount);
  return (
    <View className="flex-row items-center py-3 border-b border-border">
      <View
        className="w-8 h-8 rounded-xl items-center justify-center mr-3"
        style={{ backgroundColor: `${Colors.teal}15` }}
      >
        <Ionicons name="checkmark-circle-outline" size={15} color={Colors.teal} />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-sans-semibold text-charcoal" numberOfLines={1}>
          Session Completed
        </Text>
        <Text className="text-[11px] font-sans-medium text-muted-foreground">
          {booking.subject_name ?? "General"} · {formatBookingDate(booking.scheduled_at)}
        </Text>
      </View>
      <Text className="text-[13px] font-sans-bold" style={{ color: Colors.teal }}>
        +{formatCurrency(earned, booking.currency, 0)}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TutorDashboard() {
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState<TutorDetail | null>(null);
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [stats, setStats] = useState<TutorStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const p = await getMyTutorProfile();
      const b = await listTutorBookings(p.id, { page: 1, page_size: 50 });
      setProfile(p);
      setBookings(b.items);
      setStats(computeStats(b.items, p));
    } catch {
      // profile not yet configured
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  const now = new Date();
  const upcoming = bookings
    .filter((b) => b.status === "confirmed" && new Date(b.scheduled_at) > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 3);

  const recentCompleted = bookings
    .filter((b) => b.status === "completed")
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
    .slice(0, 3);

  const weekEarnings = bookings
    .filter((b) => {
      if (b.status !== "completed") return false;
      const d = new Date(b.scheduled_at);
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    })
    .reduce((s, b) => s + parseFloat(b.amount), 0);

  const totalMinutes = bookings
    .filter((b) => b.status === "completed")
    .reduce((s, b) => s + b.duration_minutes, 0);
  const hoursLabel = totalMinutes >= 60
    ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
    : `${totalMinutes}m`;

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={["top"]}>
        <ActivityIndicator color={Colors.teal} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.teal} colors={[Colors.teal]} />}
        contentContainerStyle={{
          paddingHorizontal: Spacing.xl,
          paddingTop: Spacing.base,
          paddingBottom: TabBar.height + TabBar.horizontalInset + Spacing.xl,
        }}
      >
        {/* Header */}
        <View className="mb-6">
  <View className="flex-row items-center justify-between">
    {/* Profile Info */}
    <View className="flex-1 flex-row items-center">
      {/* Avatar */}
      <View className="w-12 h-12 rounded-full bg-lightTeal items-center justify-center mr-3">
        <Text className="text-[17px] font-sans-bold text-deepTeal">
          {(profile?.display_name ??
            `${user?.first_name} ${user?.last_name}`)
            .charAt(0)
            .toUpperCase()}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-[12px] font-sans-medium text-gray-500 mb-0.5">
          Welcome back 👋
        </Text>

        <Text
          numberOfLines={1}
          className="text-[19px] font-sans-bold text-charcoal"
        >
          {profile?.display_name ??
            `${user?.first_name} ${user?.last_name}`}
        </Text>

        <View className="flex-row items-center mt-0.5">
          <Text className="text-[12px] font-sans-medium text-teal">
            {profile?.tutor_subjects[0]?.subject.name
              ? `${profile.tutor_subjects[0].subject.name} Tutor`
              : "Tutor"}
          </Text>

          {profile?.verification_status === "verified" && (
            <>
              <View className="w-1 h-1 rounded-full bg-gray-300 mx-2" />

              <Ionicons
                name="shield-checkmark"
                size={12}
                color={Colors.teal}
              />

              <Text className="text-[11px] font-sans-semibold text-teal ml-1">
                Verified
              </Text>
            </>
          )}
        </View>
      </View>
    </View>

    {/* Notifications */}
    <Pressable
      onPress={() => router.push("/(tutor)/profile")}
      className="w-11 h-11 rounded-full bg-white border border-gray-100 items-center justify-center"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <Ionicons
        name="notifications-outline"
        size={21}
        color={Colors.deepTeal}
      />

      {/* Notification indicator */}
      <View className="absolute top-[9px] right-[9px] w-[7px] h-[7px] rounded-full bg-teal border-2 border-white" />
    </Pressable>
  </View>
</View>

        {/* Week overview banner */}
        <View className="rounded-tr-3xl rounded-bl-3xl px-5 py-4 mb-5"
          style={{ backgroundColor: Colors.deepTeal }}>
          <Text className="text-[11px] font-sans-bold uppercase mb-3"
            style={{ color: `${Colors.softMint}80` }}>
            This Week Overview
          </Text>
          <View className="flex-row">
            <WeekStatCard value={String(stats?.total_sessions ?? 0)} label="Sessions" />
            <View className="w-px bg-white/10" />
            <WeekStatCard value={String(stats?.completed_sessions ?? 0)} label="Completed" />
            <View className="w-px bg-white/10" />
            <WeekStatCard value={hoursLabel} label="Time Taught" />
            <View className="w-px bg-white/10" />
            <WeekStatCard
              value={formatCurrency(weekEarnings, profile?.currency ?? "NGN", 0)}
              label="Earnings"
            />
          </View>
        </View>

        {/* Upcoming sessions */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-[15px] font-sans-bold text-charcoal">Upcoming Sessions</Text>
          <Pressable onPress={() => router.push("/(tutor)/sessions")} hitSlop={8}>
            <Text className="text-[13px] font-sans-semibold text-teal">View all</Text>
          </Pressable>
        </View>

        <View className="bg-white rounded-xl px-4 mb-5"
          style={{ borderWidth: 1, borderColor: Colors.border }}>
          {upcoming.length === 0 ? (
            <View className="items-center py-6">
              <Text className="text-[13px] font-sans-medium text-muted-foreground">
                No upcoming sessions
              </Text>
            </View>
          ) : (
            upcoming.map((b, i) => (
              <View key={b.id} style={i === upcoming.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                <UpcomingCard booking={b} />
              </View>
            ))
          )}
        </View>

        {/* Recent activity */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-[15px] font-sans-bold text-charcoal">Recent Activity</Text>
          <Pressable onPress={() => router.push("/(tutor)/earnings")} hitSlop={8}>
            <Text className="text-[13px] font-sans-semibold text-teal">View all</Text>
          </Pressable>
        </View>

        <View className="bg-white rounded-2xl px-4 mb-5"
          style={{ borderWidth: 1, borderColor: Colors.border }}>
          {recentCompleted.length === 0 ? (
            <View className="items-center py-6">
              <Text className="text-[13px] font-sans-medium text-muted-foreground">
                No completed sessions yet
              </Text>
            </View>
          ) : (
            recentCompleted.map((b, i) => (
              <View key={b.id} style={i === recentCompleted.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                <RecentActivityCard booking={b} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
