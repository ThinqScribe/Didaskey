import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  LayoutChangeEvent,
  Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Spacing, TabBar } from "@/constants";
import { useRefresh } from "@/lib/hooks/useRefresh";
import {
  formatBookingDate,
  formatBookingTimeRange,
  formatCurrency,
  sessionFormatLabel,
  type BookingResponse,
  type BookingStatus,
} from "@/lib/api/bookings";
import { getMyTutorProfile, listTutorBookings } from "@/lib/api/tutor-portal";
import { JoinSessionButton } from "@/components/classroom/JoinSessionButton";

// ─────────────────────────────────────────────────────────────────────────────
// Status configuration
// ─────────────────────────────────────────────────────────────────────────────

const TABS: { label: string; value: BookingStatus | undefined }[] = [
  { label: "Upcoming", value: "confirmed" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function statusColor(s: BookingStatus): string {
  switch (s) {
    case "confirmed":
      return Colors.teal;

    case "pending_payment":
      return Colors.gold;

    case "completed":
      return Colors.deepTeal;

    case "cancelled":
      return Colors.destructive;

    default:
      return Colors.mutedForeground;
  }
}

function statusLabel(s: BookingStatus): string {
  switch (s) {
    case "confirmed":
      return "Upcoming";

    case "pending_payment":
      return "Pending";

    case "completed":
      return "Completed";

    case "cancelled":
      return "Cancelled";

    default:
      return s;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Card
// ─────────────────────────────────────────────────────────────────────────────

function SessionCard({ booking }: { booking: BookingResponse }) {
  const color = statusColor(booking.status);

  const date = new Date(booking.scheduled_at);

  const monthLabel = date
    .toLocaleDateString("en-US", {
      month: "short",
    })
    .toUpperCase();

  const dayLabel = date.toLocaleDateString("en-US", {
    day: "2-digit",
  });

  const dateLabel = formatBookingDate(booking.scheduled_at);

  const timeLabel = formatBookingTimeRange(
    booking.scheduled_at,
    booking.duration_minutes
  );

  const formatLabel = sessionFormatLabel(booking.session_format);

  const amount = parseFloat(booking.amount);

  return (
    <View className="bg-card rounded-[24px] border border-border px-4 py-4 mb-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          {/* Date */}
          <View className="w-10 h-10 rounded-xl bg-deep-teal items-center justify-center">
            <Text className="text-[10px] font-sans-bold text-soft-mint">
              {monthLabel}
            </Text>

            <Text className="text-[17px] font-sans-bold text-white leading-4">
              {dayLabel}
            </Text>
          </View>

          {/* Session Info */}
          <View>
            <Text className="text-[13px] font-sans-bold text-charcoal" numberOfLines={1}>
              {booking.subject_name ?? "General session"}
            </Text>

            <View className="flex-row items-center gap-1 mt-0.5">
              <Ionicons
                name={booking.session_format === "online" ? "videocam-outline" : "location-outline"}
                size={12}
                color={Colors.teal}
              />

              <Text className="text-[11px] font-sans-medium text-muted-foreground">
                {formatLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* Status */}
        <View
          className="rounded-full px-3 py-1"
          style={{
            backgroundColor: `${color}18`,
          }}
        >
          <Text
            className="text-[11px] font-sans-bold"
            style={{
              color: color,
            }}
          >
            {statusLabel(booking.status)}
          </Text>
        </View>
      </View>

      {/* Details */}
      <View className="flex-row bg-background rounded-xl px-3 py-3 mb-3">
        {/* Date */}
        <View className="flex-1 flex-row items-center gap-2">
          <Ionicons
            name="calendar-outline"
            size={15}
            color={Colors.teal}
          />

          <View className="flex-1">
            <Text className="text-[10px] font-sans-medium text-muted-foreground">
              DATE
            </Text>

            <Text
              className="text-[12px] font-sans-semibold text-charcoal"
              numberOfLines={1}
            >
              {dateLabel}
            </Text>
          </View>
        </View>

        {/* Time */}
        <View className="flex-1 flex-row items-center gap-2">
          <Ionicons
            name="time-outline"
            size={15}
            color={Colors.teal}
          />

          <View className="flex-1">
            <Text className="text-[10px] font-sans-medium text-muted-foreground">
              TIME
            </Text>

            <Text
              className="text-[12px] font-sans-semibold text-charcoal"
              numberOfLines={1}
            >
              {timeLabel}
            </Text>
          </View>
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-border mb-3" />

      {/* Footer */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons
            name="time-outline"
            size={13}
            color={Colors.mutedForeground}
          />

          <Text className="text-[12px] font-sans-medium text-muted-foreground">
            {booking.duration_minutes} min
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <JoinSessionButton booking={booking} counterpartName={booking.student_name} />

          <Text className="text-[15px] font-sans-bold text-deep-teal">
            {formatCurrency(amount, booking.currency)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function TutorSessions() {
  const insets = useSafeAreaInsets();

  const [tutorId, setTutorId] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<BookingStatus | undefined>("confirmed");

  const [bookings, setBookings] = useState<BookingResponse[]>([]);

  const [loading, setLoading] = useState(true);

  const [headerHeight, setHeaderHeight] = useState(0);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch bookings
  // ───────────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);

    try {
      let id = tutorId;

      if (!id) {
        const p = await getMyTutorProfile();
        id = p.id;
        setTutorId(id);
      }

      const data = await listTutorBookings(id, {
        status: activeTab,
        page: 1,
        page_size: 50,
      });

      setBookings(data.items);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [tutorId, activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const { refreshing, onRefresh } = useRefresh(load);

  // ───────────────────────────────────────────────────────────────────────────
  // IMPORTANT:
  //
  // The bottom padding includes:
  //
  // 1. TabBar height
  // 2. Device safe-area bottom inset
  // 3. Reduced extra visual spacing
  //
  // This ensures the LAST CARD can scroll completely above
  // the fixed bottom TabBar.
  // ───────────────────────────────────────────────────────────────────────────

  const listBottomPadding = TabBar.height + insets.bottom + Spacing.lg;

  // ───────────────────────────────────────────────────────────────────────────
  // Measure header height
  // ───────────────────────────────────────────────────────────────────────────

  const onHeaderLayout = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;

    if (height > 0 && height !== headerHeight) {
      setHeaderHeight(height);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Calculate list height
  // ───────────────────────────────────────────────────────────────────────────

  const screenHeight = Dimensions.get("window").height;
  const listHeight = screenHeight - headerHeight - insets.top;

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top"]}
    >
      {/* ─────────────────────────────────────────────────────────────── */}
      {/* Fixed Header Section */}
      {/* ─────────────────────────────────────────────────────────────── */}

      <View onLayout={onHeaderLayout}>
        <View className="px-6 pt-5 pb-4">
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="text-[12px] font-sans-bold text-teal uppercase">
                Tutor Portal
              </Text>

              <Text className="text-[26px] font-sans-bold text-charcoal mt-1">
                My Sessions
              </Text>

              <Text className="text-[13px] font-sans-medium text-muted-foreground mt-1">
                Manage your upcoming lessons.
              </Text>
            </View>

            <View className="w-11 h-11 rounded-2xl bg-deep-teal items-center justify-center">
              <Ionicons
                name="calendar"
                size={21}
                color={Colors.softMint}
              />
            </View>
          </View>

          <View className="flex-row items-center gap-2 mt-4">
            <View className="w-2 h-2 rounded-full bg-teal" />

            <Text className="text-[12px] font-sans-semibold text-charcoal">
              {bookings.length}{" "}
              {bookings.length === 1 ? "session" : "sessions"} in view
            </Text>
          </View>
        </View>

        {/* Status Tabs */}
        <View className="px-6 pb-4">
          <Text className="text-[11px] font-sans-bold text-muted-foreground uppercase mb-2">
            Filter sessions
          </Text>

          <FlatList
            data={TABS}
            keyExtractor={(item) => item.label}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => {
              const active = activeTab === item.value;

              return (
                <Pressable
                  onPress={() => setActiveTab(item.value)}
                  className={`px-1 mr-5 pb-2 border-b-2 ${
                    active
                      ? "border-teal"
                      : "border-transparent"
                  }`}
                >
                  <Text
                    className={`text-[12px] font-sans-bold ${
                      active
                        ? "text-deep-teal"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </View>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* Scrollable Content */}
      {/* ─────────────────────────────────────────────────────────────── */}

      {loading ? (
        <View
          style={{ height: listHeight }}
          className="items-center justify-center"
        >
          <ActivityIndicator color={Colors.teal} />
        </View>
      ) : bookings.length === 0 ? (
        <View
          style={{ height: listHeight }}
          className="items-center justify-center px-6"
        >
          <View className="w-20 h-20 rounded-full bg-muted items-center justify-center mb-5">
            <Ionicons
              name="calendar-outline"
              size={36}
              color={Colors.deepTeal}
            />
          </View>

          <Text className="text-[18px] font-sans-bold text-charcoal mb-2 text-center">
            {activeTab === "confirmed"
              ? "No upcoming sessions"
              : activeTab === "completed"
              ? "No completed sessions"
              : "No cancelled sessions"}
          </Text>

          <Text className="text-[14px] font-sans-medium text-muted-foreground text-center">
            {activeTab === "confirmed"
              ? "Confirmed sessions will appear here."
              : "Nothing to show here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(booking) => String(booking.id)}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.teal}
              colors={[Colors.teal]}
            />
          }
          style={{ height: listHeight }}
          contentContainerStyle={{
            paddingHorizontal: Spacing.xl,
            paddingTop: Spacing.base,
            paddingBottom: listBottomPadding,
          }}
          scrollIndicatorInsets={{
            bottom: listBottomPadding,
          }}
          renderItem={({ item }) => (
            <SessionCard booking={item} />
          )}
        />
      )}
    </SafeAreaView>
  );
}
