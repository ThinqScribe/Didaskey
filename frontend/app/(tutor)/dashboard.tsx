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
import { useUnreadIndicators } from "@/lib/hooks/useUnreadIndicators";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { formatCurrency, formatBookingDate, type BookingResponse } from "@/lib/api/bookings";
import { getMyTutorProfile, listTutorBookings, getTutorStats, type TutorStats } from "@/lib/api/tutor-portal";
import type { TutorDetail } from "@/lib/api/tutors";
import QuickLinks from "@/components/QuickLinks";
import { UnreadBadge } from "@/components/ui/UnreadBadge";

// ── Sub-components ────────────────────────────────────────────────────────────

function WeekStatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ width: "48%", padding: 13, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)" }}>
      <Text className="text-[19px] font-sans-bold text-white">{value}</Text>
      <Text className="text-[11px] font-sans-medium mt-1" style={{ color: "#B9D9D3" }}>
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
      <View className="w-9 h-9 rounded-lg bg-muted items-center justify-center mr-3">
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
        className="w-8 h-8 rounded-lg items-center justify-center mr-3"
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
  const unread = useUnreadIndicators();
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
      setStats(await getTutorStats());
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
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        }}
      >
        {/* Header */}
        <View className="mb-6">
  <View className="flex-row items-center justify-between">
    {/* Profile Info */}
    <View className="flex-1 flex-row items-center">
      {/* Avatar */}
      <View className="w-12 h-12 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: Colors.paleTeal }}>
        <Text className="text-[17px] font-sans-bold text-deep-teal">
          {(profile?.display_name ??
            `${user?.first_name} ${user?.last_name}`)
            .charAt(0)
            .toUpperCase()}
        </Text>
      </View>

      <View className="flex-1">
        <Text className="text-[12px] font-sans-medium text-muted-foreground mb-0.5">
          Welcome back
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
              <View className="w-1 h-1 rounded-full bg-border mx-2" />

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
      onPress={() => router.push("/notifications")}
      className="w-11 h-11 rounded-full bg-card border border-border items-center justify-center"
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

      <UnreadBadge count={unread.notifications} style={{ top: -3, right: -3, borderColor: "#FFFFFF" }} />
    </Pressable>
  </View>
</View>

        <View className="mb-5"><QuickLinks /></View>

        {/* Week overview banner */}
        <View className="rounded-lg px-5 py-5 mb-5"
          style={{ backgroundColor: Colors.deepTeal }}>
          <Text className="text-[11px] font-sans-bold uppercase mb-3"
            style={{ color: `${Colors.softMint}80` }}>
            Your Teaching Overview
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            <WeekStatCard value={String(stats?.total_sessions ?? 0)} label="Sessions" />
            <WeekStatCard value={String(stats?.completed_sessions ?? 0)} label="Completed" />
            <WeekStatCard value={hoursLabel} label="Time Taught" />
            <WeekStatCard
              value={formatCurrency(parseFloat(stats?.total_earnings ?? "0"), stats?.currency ?? profile?.currency ?? "NGN", 0)}
              label="Gross earned"
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

        <View className="bg-card rounded-lg px-4 mb-5"
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

        <View className="bg-card rounded-lg px-4 mb-5"
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
