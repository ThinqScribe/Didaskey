import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { Colors, Spacing, TabBar } from "@/constants";
import { useAuthStore } from "@/lib/store/auth";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { uploadAvatar } from "@/lib/api/auth";
import {
  listBookings,
  formatBookingDate,
  formatBookingTimeRange,
  type BookingResponse,
} from "@/lib/api/bookings";

// ── Config ────────────────────────────────────────────────────────────────────

const EDUCATION_LABELS: Record<string, string> = {
  primary_school:   "Primary School",
  junior_secondary: "Junior Secondary",
  senior_secondary: "Senior Secondary",
  high_school:      "High School",
  undergraduate:    "Undergraduate",
  postgraduate:     "Postgraduate",
};

function statusColor(s: string) {
  if (s === "confirmed")  return Colors.teal;
  if (s === "completed")  return Colors.deepTeal;
  if (s === "cancelled")  return Colors.destructive;
  return Colors.gold;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 items-center py-4">
      <Text className="text-[20px] font-sans-bold text-charcoal">{value}</Text>
      <Text className="text-[11px] font-sans-medium text-muted-foreground mt-1">{label}</Text>
    </View>
  );
}

function ActivityCard({ booking }: { booking: BookingResponse }) {
  const color = statusColor(booking.status);
  return (
    <View
      className="flex-row items-center bg-white rounded-xl px-4 py-3 mb-2"
      style={{ borderWidth: 1, borderColor: Colors.border }}
    >
      <View className="w-9 h-9 rounded-xl bg-muted items-center justify-center mr-3">
        <Ionicons name="calendar-outline" size={16} color={Colors.deepTeal} />
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-sans-semibold text-charcoal" numberOfLines={1}>
          {booking.subject_name ?? "General session"}
        </Text>
        <Text className="text-[11px] font-sans-medium text-muted-foreground mt-0.5">
          {formatBookingDate(booking.scheduled_at)} · {formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}
        </Text>
      </View>
      <View
        className="rounded-full px-2.5 py-1 ml-2"
        style={{ backgroundColor: `${color}18` }}
      >
        <Text className="text-[10px] font-sans-bold capitalize" style={{ color }}>
          {booking.status === "pending_payment" ? "Pending" : booking.status}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function StudentProfile() {
  const { user, setUser, signOut } = useAuthStore();
  const [recentBookings, setRecentBookings] = useState<BookingResponse[]>([]);
  const [loading, setLoading]               = useState(true);
  const [uploading, setUploading]           = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listBookings({ page: 1, page_size: 5 });
      setRecentBookings(data.items);
    } catch {
      setRecentBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  const completed     = recentBookings.filter((b) => b.status === "completed").length;
  const totalSessions = recentBookings.length;
  const eduLabel      = user?.education_level
    ? EDUCATION_LABELS[user.education_level]?.split(" ")[0] ?? "—"
    : "—";

  async function handlePickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow photo access to upload a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const updated = await uploadAvatar(asset.uri, asset.mimeType ?? "image/jpeg");
      setUser(updated);
    } catch {
      Alert.alert("Upload failed", "Could not update your photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  }

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.teal}
            colors={[Colors.teal]}
          />
        }
        contentContainerStyle={{
          paddingBottom: TabBar.height + TabBar.horizontalInset + Spacing.xl,
        }}
      >
        {/* ── Hero header ───────────────────────────────────────────────── */}
        <View
          className="px-6 pt-6 pb-8"
          style={{ backgroundColor: Colors.deepTeal }}
        >
          <View className="flex-row items-center gap-4">
            {/* Avatar */}
            <Pressable onPress={handlePickImage} disabled={uploading}>
              <View className="w-20 h-20 rounded-full bg-white/20 items-center justify-center">
                {user?.profile_image_url ? (
                  <Image
                    source={{ uri: user.profile_image_url }}
                    style={{ width: 80, height: 80, borderRadius: 40 }}
                  />
                ) : (
                  <Ionicons name="person" size={36} color={Colors.white} />
                )}
                <View
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full items-center justify-center"
                  style={{ backgroundColor: Colors.teal }}
                >
                  {uploading
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Ionicons name="camera" size={12} color={Colors.white} />}
                </View>
              </View>
            </Pressable>

            {/* Identity */}
            <View className="flex-1">
              <Text className="text-[20px] font-sans-bold text-white">
                {user?.first_name} {user?.last_name}
              </Text>
              <Text className="text-[13px] font-sans-medium mt-0.5" style={{ color: `${Colors.softMint}cc` }}>
                Student
              </Text>
              {user?.is_verified && (
                <View className="flex-row items-center gap-1 mt-1.5">
                  <Ionicons name="checkmark-circle" size={13} color={Colors.softMint} />
                  <Text className="text-[12px] font-sans-semibold text-soft-mint">Verified</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <View className="mx-6 -mt-5 bg-white rounded-2xl flex-row shadow-sm"
          style={{ borderWidth: 1, borderColor: Colors.border }}>
          <StatPill value={totalSessions} label="Sessions" />
          <View className="w-px bg-border my-3" />
          <StatPill value={completed} label="Completed" />
          <View className="w-px bg-border my-3" />
          <StatPill value="4.8" label="Rating" />
          <View className="w-px bg-border my-3" />
          <StatPill value={eduLabel} label="Level" />
        </View>

        <View className="px-6 mt-5">
          {/* About */}
          <View
            className="bg-white rounded-2xl px-4 py-4 mb-4"
            style={{ borderWidth: 1, borderColor: Colors.border }}
          >
            <Text className="text-[14px] font-sans-bold text-charcoal mb-2">About Me</Text>
            <Text className="text-[13px] font-sans-medium text-muted-foreground leading-5">
              {user?.education_level
                ? `${EDUCATION_LABELS[user.education_level]} student, passionate about learning and growing every day.`
                : "No bio yet."}
            </Text>
          </View>

          {/* Account info */}
          <View
            className="bg-white rounded-2xl px-4 mb-5"
            style={{ borderWidth: 1, borderColor: Colors.border }}
          >
            {([
              { icon: "mail-outline",   label: "Email",     value: user?.email ?? "—" },
              { icon: "call-outline",   label: "Phone",     value: user?.phone_number ?? "—" },
              { icon: "school-outline", label: "Education", value: user?.education_level ? EDUCATION_LABELS[user.education_level] : "—" },
            ] as const).map(({ icon, label, value }, i, arr) => (
              <View
                key={label}
                className={`flex-row items-center gap-3 py-3.5 ${i < arr.length - 1 ? "border-b border-border" : ""}`}
              >
                <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                  <Ionicons name={icon} size={15} color={Colors.deepTeal} />
                </View>
                <Text className="flex-1 text-[13px] font-sans-medium text-muted-foreground">{label}</Text>
                <Text
                  className="text-[13px] font-sans-semibold text-charcoal"
                  numberOfLines={1}
                  style={{ maxWidth: 180 }}
                >
                  {value}
                </Text>
              </View>
            ))}
          </View>

          {/* Recent activity */}
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[15px] font-sans-bold text-charcoal">Recent Activity</Text>
            <Pressable onPress={() => router.push("/(tabs)/bookings")} hitSlop={8}>
              <Text className="text-[13px] font-sans-semibold text-teal">View all</Text>
            </Pressable>
          </View>

          {recentBookings.length === 0 ? (
            <View
              className="bg-white rounded-xl items-center py-8"
              style={{ borderWidth: 1, borderColor: Colors.border }}
            >
              <Ionicons name="calendar-outline" size={28} color={Colors.mutedForeground} />
              <Text className="text-[13px] font-sans-medium text-muted-foreground mt-2">
                No sessions yet
              </Text>
            </View>
          ) : (
            recentBookings.slice(0, 4).map((b) => <ActivityCard key={b.id} booking={b} />)
          )}

          {/* Sign out — full-width at bottom */}
          <Pressable
            onPress={handleSignOut}
            className="mt-6 rounded-2xl bg-white items-center flex-row justify-center gap-2 py-4 active:opacity-70"
            style={{ borderWidth: 1, borderColor: `${Colors.destructive}30` }}
          >
            <Ionicons name="log-out-outline" size={18} color={Colors.destructive} />
            <Text className="text-[15px] font-sans-semibold" style={{ color: Colors.destructive }}>
              Sign Out
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
