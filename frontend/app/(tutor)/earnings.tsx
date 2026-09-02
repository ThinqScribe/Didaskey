import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  LayoutChangeEvent,
  Dimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Spacing, TabBar } from "@/constants";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { formatCurrency, formatBookingDate, type BookingResponse } from "@/lib/api/bookings";
import { getMyTutorProfile, listTutorBookings } from "@/lib/api/tutor-portal";
import type { TutorDetail } from "@/lib/api/tutors";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function groupByMonth(bookings: BookingResponse[]): {
  label: string;
  items: BookingResponse[];
  total: number;
}[] {
  const map = new Map<string, BookingResponse[]>();

  for (const b of bookings) {
    const key = new Date(b.scheduled_at).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b);
  }

  return Array.from(map.entries()).map(([label, items]) => ({
    label,
    items,
    total: items.reduce((s, b) => s + parseFloat(b.amount), 0),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatStrip({
  sessions,
  hours,
  avgSession,
  currency,
}: {
  sessions: number;
  hours: string;
  avgSession: number;
  currency: string;
}) {
  return (
    <View className="flex-row bg-white rounded-2xl mb-5">
      {[
        { value: String(sessions), label: "Sessions" },
        { value: hours, label: "Time Taught" },
        { value: formatCurrency(avgSession, currency, 0), label: "Avg. Session" },
      ].map(({ value, label }, i, arr) => (
        <View key={label} className="flex-1 items-center py-3.5 px-2">
          {i > 0 && <View className="absolute left-0 top-3 bottom-3 w-px bg-border" />}
          <Text className="text-[16px] font-sans-bold text-charcoal">{value}</Text>
          <Text className="text-[10px] font-sans-medium text-muted-foreground mt-0.5">
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EarningsRow({ booking }: { booking: BookingResponse }) {
  const date = new Date(booking.scheduled_at);

  const monthLabel = date
    .toLocaleDateString("en-US", {
      month: "short",
    })
    .toUpperCase();

  const dayLabel = date.toLocaleDateString("en-US", {
    day: "2-digit",
  });

  return (
    <View className="flex-row items-center py-3 border-b border-border last:border-0">
      {/* Date */}
      <View className="w-10 h-10 rounded-xl bg-deep-teal items-center justify-center mr-3">
        <Text className="text-[9px] font-sans-bold text-soft-mint">
          {monthLabel}
        </Text>

        <Text className="text-[15px] font-sans-bold text-white leading-4">
          {dayLabel}
        </Text>
      </View>

      {/* Info */}
      <View className="flex-1">
        <Text className="text-[13px] font-sans-semibold text-charcoal" numberOfLines={1}>
          {booking.subject_name ?? "General session"}
        </Text>

        <View className="flex-row items-center gap-1 mt-0.5">
          <Ionicons
            name="time-outline"
            size={11}
            color={Colors.mutedForeground}
          />

          <Text className="text-[11px] font-sans-medium text-muted-foreground">
            {booking.duration_minutes} min
          </Text>
        </View>
      </View>

      {/* Amount */}
      <View className="items-end ml-3">
        <Text className="text-[14px] font-sans-bold" style={{ color: Colors.teal }}>
          +{formatCurrency(parseFloat(booking.amount), booking.currency)}
        </Text>

        <View className="flex-row items-center gap-1 mt-0.5">
          <Ionicons
            name="checkmark-circle"
            size={11}
            color={Colors.teal}
          />

          <Text className="text-[10px] font-sans-medium text-teal">Completed</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function TutorEarnings() {
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<TutorDetail | null>(null);

  const [bookings, setBookings] = useState<BookingResponse[]>([]);

  const [loading, setLoading] = useState(true);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch data
  // ───────────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const p = await getMyTutorProfile();

      const data = await listTutorBookings(p.id, {
        status: "completed",
        page: 1,
        page_size: 100,
      });

      setProfile(p);
      setBookings(data.items);
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { refreshing, onRefresh } = useRefresh(load);

  // ───────────────────────────────────────────────────────────────────────────
  // Calculations
  // ───────────────────────────────────────────────────────────────────────────

  const currency = profile?.currency ?? "NGN";

  const totalEarnings = bookings.reduce((s, b) => s + parseFloat(b.amount), 0);

  const totalMinutes = bookings.reduce((s, b) => s + b.duration_minutes, 0);

  const hoursLabel =
    totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
      : `${totalMinutes}m`;

  const avgSession = bookings.length > 0 ? totalEarnings / bookings.length : 0;

  const groups = groupByMonth(bookings);

  // ───────────────────────────────────────────────────────────────────────────
  // Bottom padding
  // ───────────────────────────────────────────────────────────────────────────

  const bottomPadding = TabBar.height + insets.bottom + Spacing.xl;

  // ───────────────────────────────────────────────────────────────────────────
  // Loading state
  // ───────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 bg-background items-center justify-center"
        edges={["top"]}
      >
        <ActivityIndicator color={Colors.teal} />
      </SafeAreaView>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Main render
  // ───────────────────────────────────────────────────────────────────────────

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
          paddingHorizontal: Spacing.xl,
          paddingTop: Spacing.base,
          paddingBottom: bottomPadding,
        }}
      >
        {/* ─────────────────────────────────────────────────────────────── */}
        {/* Header */}
        {/* ─────────────────────────────────────────────────────────────── */}

        <View className="flex-row items-start justify-between mb-5">
          <View>
            <Text className="text-[12px] font-sans-bold text-teal uppercase">
              Tutor Portal
            </Text>

            <Text className="text-[26px] font-sans-bold text-charcoal mt-1">
              Earnings
            </Text>

            <Text className="text-[13px] font-sans-medium text-muted-foreground mt-1">
              Track your teaching income.
            </Text>
          </View>

          <View className="w-11 h-11 rounded-2xl bg-deep-teal items-center justify-center">
            <Ionicons
              name="wallet"
              size={21}
              color={Colors.softMint}
            />
          </View>
        </View>

        {/* ─────────────────────────────────────────────────────────────── */}
        {/* Total Earnings Banner */}
        {/* ─────────────────────────────────────────────────────────────── */}

        <View
          className="rounded-tr-3xl rounded-bl-3xl px-5 py-5 mb-5"
          style={{ backgroundColor: Colors.deepTeal }}
        >
          <Text
            className="text-[12px] font-sans-medium uppercase"
            style={{ color: `${Colors.softMint}80` }}
          >
            Total Earnings
          </Text>

          <Text className="text-[34px] font-sans-bold text-white mt-1">
            {formatCurrency(totalEarnings, currency, 0)}
          </Text>

          <View className="flex-row items-center gap-2 mt-2">
            <View className="w-1.5 h-1.5 rounded-full bg-soft-mint/60" />

            <Text
              className="text-[12px] font-sans-medium"
              style={{ color: `${Colors.softMint}80` }}
            >
              From {bookings.length} completed{" "}
              {bookings.length === 1 ? "session" : "sessions"}
            </Text>
          </View>
        </View>

        {/* ─────────────────────────────────────────────────────────────── */}
        {/* Stats Strip */}
        {/* ─────────────────────────────────────────────────────────────── */}

        <StatStrip
          sessions={bookings.length}
          hours={hoursLabel}
          avgSession={avgSession}
          currency={currency}
        />

        {/* ─────────────────────────────────────────────────────────────── */}
        {/* Earnings History */}
        {/* ─────────────────────────────────────────────────────────────── */}

        <Text className="text-[15px] font-sans-bold text-charcoal mb-3">
          Earnings History
        </Text>

        {groups.length === 0 ? (
          /* Empty State */
          <View
            className="bg-white rounded-2xl items-center py-12"
            style={{ borderWidth: 1, borderColor: Colors.border }}
          >
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center mb-4">
              <Ionicons
                name="wallet-outline"
                size={32}
                color={Colors.deepTeal}
              />
            </View>

            <Text className="text-[16px] font-sans-bold text-charcoal">
              No earnings yet
            </Text>

            <Text className="text-[13px] font-sans-medium text-muted-foreground mt-1 text-center">
              Completed session earnings will appear here.
            </Text>
          </View>
        ) : (
          /* Earnings Groups */
          groups.map((group) => (
            <View key={group.label} className="mb-5">
              <View className="flex-row items-center justify-between mb-2 px-1">
                <Text className="text-[14px] font-sans-bold text-charcoal">
                  {group.label}
                </Text>

                <Text
                  className="text-[14px] font-sans-bold"
                  style={{ color: Colors.teal }}
                >
                  {formatCurrency(group.total, currency, 0)}
                </Text>
              </View>

              <View
                className="bg-white rounded-2xl px-4"
                style={{ borderWidth: 1, borderColor: Colors.border }}
              >
                {group.items.map((b) => (
                  <EarningsRow key={b.id} booking={b} />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}