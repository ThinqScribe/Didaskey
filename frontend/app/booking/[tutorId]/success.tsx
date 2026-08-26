/**
 * Booking Step 6 — Booking Confirmed
 *
 * Shown after Paystack onSuccess fires. The booking is in `pending_payment`
 * or transitioning to `confirmed` at this point — the webhook confirms it
 * asynchronously. We show the details optimistically from the params
 * passed by the confirm screen rather than polling the backend.
 *
 * Actions:
 *  - "Go to My Sessions" → bookings tab
 *  - "Add to Calendar"   → placeholder (calendar integration future scope)
 */

import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Spacing } from "@/constants";
import {
  formatBookingDate,
  formatBookingTimeRange,
  formatCurrency,
  sessionFormatLabel,
  type SessionFormat,
} from "@/lib/api/bookings";

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-border">
      <Text className="text-[13px] font-sans-medium text-muted-foreground">
        {label}
      </Text>
      <Text className="text-[13px] font-sans-semibold text-charcoal">{value}</Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SuccessScreen() {
  const params = useLocalSearchParams<{
    bookingId: string;
    displayName: string;
    subjectName: string;
    scheduledAt: string;
    duration: string;
    sessionFormat: string;
    amount: string;
    currency: string;
    reference: string;
  }>();

  const duration = Number(params.duration ?? "60");
  const sessionFormat = (params.sessionFormat ?? "online") as SessionFormat;
  const amount = parseFloat(params.amount ?? "0");

  const dateLabel = params.scheduledAt ? formatBookingDate(params.scheduledAt) : "—";
  const timeLabel = params.scheduledAt
    ? formatBookingTimeRange(params.scheduledAt, duration)
    : "—";
  const durationLabel = duration < 60 ? `${duration} min` : `${duration / 60} hour`;
  const formatLabel = sessionFormatLabel(sessionFormat);

  // Booking ID display: zero-padded to look like "TUT12345678"
  const bookingRef = params.bookingId
    ? `TUT${params.bookingId.padStart(8, "0")}`
    : params.reference?.slice(0, 12).toUpperCase() ?? "—";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: Spacing.xl,
          paddingTop: Spacing.xl,
          paddingBottom: 110,
          alignItems: "center",
        }}
      >
        {/* ── Success icon ─────────────────────────────────────────────────── */}
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: `${Colors.teal}20` }}
        >
          <View className="w-14 h-14 rounded-full bg-teal items-center justify-center">
            <Ionicons name="checkmark" size={32} color={Colors.white} />
          </View>
        </View>

        <Text className="text-[22px] font-sans-bold text-charcoal text-center mb-1">
          Booking Confirmed!
        </Text>
        <Text className="text-[13px] font-sans-medium text-muted-foreground text-center mb-6">
          Your session has been successfully booked.
        </Text>

        {/* ── Booking details card ──────────────────────────────────────────── */}
        <View
          className="w-full bg-white rounded-tl-3xl rounded-br-3xl border border-border px-4 py-2 mb-5"
        >
          {/* Tutor / subject header */}
          <View className="flex-row items-center gap-3 py-3 border-b border-border">
            <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
              <Ionicons name="person" size={18} color={Colors.deepTeal} />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-sans-bold text-charcoal">
                {params.displayName}
              </Text>
              <Text className="text-[12px] font-sans-medium text-muted-foreground">
                {params.subjectName || "Session"}
              </Text>
            </View>
            <Text className="text-[14px] font-sans-bold text-charcoal">
              {formatCurrency(amount, params.currency ?? "NGN", 0)}
            </Text>
          </View>

          <ConfirmRow label="Date" value={dateLabel} />
          <ConfirmRow label="Time" value={timeLabel} />
          <ConfirmRow label="Duration" value={durationLabel} />
          <ConfirmRow label="Session Type" value={`1-on-1 · ${formatLabel}`} />

          {/* Booking ID — no border on last row */}
          <View className="flex-row items-center justify-between py-2.5">
            <Text className="text-[13px] font-sans-medium text-muted-foreground">
              Booking ID
            </Text>
            <Text className="text-[13px] font-sans-bold text-teal">{bookingRef}</Text>
          </View>
        </View>

        {/* ── Confirmation note ─────────────────────────────────────────────── */}
        <View className="flex-row items-start gap-2 bg-teal/10 rounded-xl px-4 py-3 w-full mb-6">
          <Ionicons name="mail-outline" size={16} color={Colors.teal} />
          <Text className="flex-1 text-[12px] font-sans-medium text-charcoal leading-5">
            A confirmation email has been sent to your inbox with all the session details.
          </Text>
        </View>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <View className="w-full gap-3">
          <Pressable
            onPress={() => {
              router.replace("/(tabs)/bookings");
            }}
            className="rounded-xl bg-deep-teal items-center py-4 active:opacity-80"
          >
            <Text className="text-[15px] font-sans-bold text-white">
              Go to My Sessions
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              // Calendar integration — future scope
              router.replace("/(tabs)/bookings");
            }}
            className="rounded-xl border border-border bg-white items-center py-4 active:opacity-80"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="calendar-outline" size={16} color={Colors.deepTeal} />
              <Text className="text-[15px] font-sans-semibold text-charcoal">
                Add to Calendar
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
