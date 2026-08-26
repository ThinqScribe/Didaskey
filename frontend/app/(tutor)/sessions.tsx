import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
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

// ── Config ────────────────────────────────────────────────────────────────────

const TABS: { label: string; value: BookingStatus | undefined }[] = [
  { label: "Upcoming",  value: "confirmed"       },
  { label: "Completed", value: "completed"       },
  { label: "Cancelled", value: "cancelled"       },
];

function statusColor(s: BookingStatus): string {
  switch (s) {
    case "confirmed":       return Colors.teal;
    case "pending_payment": return Colors.gold;
    case "completed":       return Colors.deepTeal;
    case "cancelled":       return Colors.destructive;
    default:                return Colors.mutedForeground;
  }
}

function statusLabel(s: BookingStatus): string {
  switch (s) {
    case "confirmed":       return "Upcoming";
    case "pending_payment": return "Pending";
    case "completed":       return "Completed";
    case "cancelled":       return "Cancelled";
    default:                return s;
  }
}

// ── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({ booking }: { booking: BookingResponse }) {
  const color = statusColor(booking.status);

  return (
    <View className="bg-white rounded-xl px-4 py-4 mb-3"
      style={{ borderWidth: 1, borderColor: Colors.border }}>
      {/* Top row */}
      <View className="flex-row items-start justify-between mb-3">
        <View className="flex-1 mr-3">
          <Text className="text-[14px] font-sans-bold text-charcoal" numberOfLines={1}>
            {booking.subject_name ?? "General session"}
          </Text>
          <Text className="text-[12px] font-sans-medium text-muted-foreground mt-0.5">
            {formatBookingDate(booking.scheduled_at)} · {formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}
          </Text>
          <View className="flex-row items-center gap-1 mt-1">
            <Ionicons
              name={booking.session_format === "online" ? "videocam-outline" : "location-outline"}
              size={12}
              color={Colors.teal}
            />
            <Text className="text-[11px] font-sans-medium text-muted-foreground">
              {sessionFormatLabel(booking.session_format)}
            </Text>
          </View>
        </View>
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: `${color}15` }}>
          <Text className="text-[11px] font-sans-bold" style={{ color }}>
            {statusLabel(booking.status)}
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-border mb-3" />

      {/* Footer */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="time-outline" size={13} color={Colors.mutedForeground} />
          <Text className="text-[12px] font-sans-medium text-muted-foreground">
            {booking.duration_minutes} min
          </Text>
        </View>
        <Text className="text-[14px] font-sans-bold text-deep-teal">
          {formatCurrency(parseFloat(booking.amount), booking.currency)}
        </Text>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TutorSessions() {
  const insets = useSafeAreaInsets();
  const [tutorId, setTutorId]     = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<BookingStatus | undefined>("confirmed");
  const [bookings, setBookings]   = useState<BookingResponse[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let id = tutorId;
      if (!id) {
        const p = await getMyTutorProfile();
        id = p.id;
        setTutorId(id);
      }
      const data = await listTutorBookings(id, { status: activeTab, page: 1, page_size: 50 });
      setBookings(data.items);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [tutorId, activeTab]);

  useEffect(() => { load(); }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  const listPadding = TabBar.height + insets.bottom + Spacing.lg;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-6 pt-5 pb-2">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-[12px] font-sans-bold text-teal uppercase">Tutor Portal</Text>
            <Text className="text-[24px] font-sans-bold text-charcoal mt-0.5">My Sessions</Text>
          </View>
          <View className="w-10 h-10 rounded-2xl bg-deep-teal items-center justify-center">
            <Ionicons name="calendar" size={20} color={Colors.softMint} />
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row px-6 border-b border-border mb-1">
        {TABS.map((tab) => {
          const active = activeTab === tab.value;
          return (
            <Pressable
              key={tab.label}
              onPress={() => setActiveTab(tab.value)}
              className={`mr-6 pb-3 pt-2 border-b-2 ${active ? "border-teal" : "border-transparent"}`}
            >
              <Text className={`text-[13px] font-sans-bold ${active ? "text-deep-teal" : "text-muted-foreground"}`}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.teal} />
        </View>
      ) : bookings.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="calendar-outline" size={40} color={Colors.mutedForeground} />
          <Text className="text-[16px] font-sans-bold text-charcoal mt-4">No sessions</Text>
          <Text className="text-[13px] font-sans-medium text-muted-foreground mt-1 text-center">
            {activeTab === "confirmed" ? "Confirmed sessions will appear here." : "Nothing to show here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => String(b.id)}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.teal} colors={[Colors.teal]} />}
          contentContainerStyle={{
            paddingHorizontal: Spacing.xl,
            paddingTop: Spacing.base,
            paddingBottom: listPadding,
          }}
          renderItem={({ item }) => <SessionCard booking={item} />}
        />
      )}
    </SafeAreaView>
  );
}
