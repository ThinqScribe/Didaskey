/**
 * Booking Payment Failed
 *
 * Shown when Paystack returns to the app and the booking is still in
 * `pending_payment` after polling, or when an explicit payment error
 * is detected.
 *
 * Actions:
 *  - "Try Again"        → back to confirm step 4 to re-attempt payment
 *  - "Go to My Bookings" → bookings tab (booking stays pending_payment)
 *  - "Contact Support"  → placeholder
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

function DetailRow({ label, value }: { label: string; value: string }) {
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

export default function PaymentFailedScreen() {
  const params = useLocalSearchParams<{
    tutorId: string;
    bookingId: string;
    displayName: string;
    subjectName: string;
    scheduledAt: string;
    duration: string;
    sessionFormat: string;
    amount: string;
    currency: string;
    // Optional reason forwarded from the error surface
    reason: string;
  }>();

  const duration = Number(params.duration ?? "60");
  const sessionFormat = (params.sessionFormat ?? "online") as SessionFormat;
  const amount = parseFloat(params.amount ?? "0");
  const currency = params.currency ?? "NGN";

  const dateLabel = params.scheduledAt
    ? formatBookingDate(params.scheduledAt)
    : "—";
  const timeLabel = params.scheduledAt
    ? formatBookingTimeRange(params.scheduledAt, duration)
    : "—";
  const durationLabel =
    duration < 60 ? `${duration} min` : `${duration / 60} hour`;
  const formatLabel = sessionFormatLabel(sessionFormat);

  const bookingRef = params.bookingId
    ? `TUT${params.bookingId.padStart(8, "0")}`
    : "—";

  // ── Retry: go back to bookings so the user can tap "Awaiting payment" ───────
  const handleRetry = () => {
    router.replace("/(tabs)/bookings");
  };

  const handleViewBookings = () => {
    router.replace("/(tabs)/bookings");
  };

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
        {/* ── Failed icon ──────────────────────────────────────────────────── */}
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: `${Colors.destructive}18` }}
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{ backgroundColor: Colors.destructive }}
          >
            <Ionicons name="close" size={32} color={Colors.white} />
          </View>
        </View>

        <Text className="text-[22px] font-sans-bold text-charcoal text-center mb-1">
          Payment Failed
        </Text>
        <Text className="text-[13px] font-sans-medium text-muted-foreground text-center mb-2">
          Something went wrong with your payment.
        </Text>
        <Text className="text-[13px] font-sans-medium text-muted-foreground text-center mb-6">
          Your booking is still reserved — no charge was made.
        </Text>

        {/* ── Reason banner (shown only when a reason is passed) ──────────── */}
        {!!params.reason && (
          <View
            className="flex-row items-start gap-2 rounded-xl px-4 py-3 w-full mb-5"
            style={{
              backgroundColor: `${Colors.destructive}10`,
              borderWidth: 1,
              borderColor: `${Colors.destructive}30`,
            }}
          >
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={Colors.destructive}
            />
            <Text
              className="flex-1 text-[13px] font-sans-medium"
              style={{ color: Colors.destructive }}
            >
              {params.reason}
            </Text>
          </View>
        )}

        {/* ── Booking details card ─────────────────────────────────────────── */}
        <View className="w-full bg-white rounded-tl-3xl rounded-br-3xl border border-border px-4 py-2 mb-5">
          {/* Tutor / subject header */}
          <View className="flex-row items-center gap-3 py-3 border-b border-border">
            <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
              <Ionicons name="person" size={18} color={Colors.deepTeal} />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-sans-bold text-charcoal">
                {params.displayName || "Your Tutor"}
              </Text>
              <Text className="text-[12px] font-sans-medium text-muted-foreground">
                {params.subjectName || "Session"}
              </Text>
            </View>
            <Text className="text-[14px] font-sans-bold text-charcoal">
              {formatCurrency(amount, currency, 0)}
            </Text>
          </View>

          <DetailRow label="Date" value={dateLabel} />
          <DetailRow label="Time" value={timeLabel} />
          <DetailRow label="Duration" value={durationLabel} />
          <DetailRow label="Session Type" value={`1-on-1 · ${formatLabel}`} />

          {/* Booking ID — no border on last row */}
          <View className="flex-row items-center justify-between py-2.5">
            <Text className="text-[13px] font-sans-medium text-muted-foreground">
              Booking Ref
            </Text>
            <Text className="text-[13px] font-sans-bold text-muted-foreground">
              {bookingRef}
            </Text>
          </View>
        </View>

        {/* ── What happens next ────────────────────────────────────────────── */}
        <View className="w-full bg-white rounded-xl border border-border px-4 py-4 mb-6">
          <Text className="text-[13px] font-sans-bold text-charcoal mb-3">
            What happens next?
          </Text>

          <View className="flex-row items-start gap-3 mb-3">
            <View
              className="w-6 h-6 rounded-full items-center justify-center mt-0.5"
              style={{ backgroundColor: `${Colors.gold}20` }}
            >
              <Text className="text-[11px] font-sans-bold" style={{ color: Colors.gold }}>
                1
              </Text>
            </View>
            <Text className="flex-1 text-[13px] font-sans-medium text-muted-foreground leading-5">
              Your booking slot is still held for you.
            </Text>
          </View>

          <View className="flex-row items-start gap-3 mb-3">
            <View
              className="w-6 h-6 rounded-full items-center justify-center mt-0.5"
              style={{ backgroundColor: `${Colors.gold}20` }}
            >
              <Text className="text-[11px] font-sans-bold" style={{ color: Colors.gold }}>
                2
              </Text>
            </View>
            <Text className="flex-1 text-[13px] font-sans-medium text-muted-foreground leading-5">
              Tap &quot;Try Again&quot; to complete your payment before the slot expires.
            </Text>
          </View>

          <View className="flex-row items-start gap-3">
            <View
              className="w-6 h-6 rounded-full items-center justify-center mt-0.5"
              style={{ backgroundColor: `${Colors.gold}20` }}
            >
              <Text className="text-[11px] font-sans-bold" style={{ color: Colors.gold }}>
                3
              </Text>
            </View>
            <Text className="flex-1 text-[13px] font-sans-medium text-muted-foreground leading-5">
              If you continue to have issues, contact our support team.
            </Text>
          </View>
        </View>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <View className="w-full gap-3">
          {/* Primary: retry payment */}
          <Pressable
            onPress={handleRetry}
            className="rounded-xl bg-deep-teal items-center py-4 active:opacity-80"
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="refresh-outline" size={18} color={Colors.white} />
              <Text className="text-[15px] font-sans-bold text-white">
                Try Again
              </Text>
            </View>
          </Pressable>

          {/* Secondary: go to bookings */}
          <Pressable
            onPress={handleViewBookings}
            className="rounded-xl border border-border bg-white items-center py-4 active:opacity-80"
          >
            <Text className="text-[15px] font-sans-semibold text-charcoal">
              View My Bookings
            </Text>
          </Pressable>

          {/* Tertiary: contact support */}
          <Pressable
            onPress={() => {
              router.push("/help");
            }}
            className="items-center py-3 active:opacity-60"
          >
            <View className="flex-row items-center gap-1.5">
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={14}
                color={Colors.teal}
              />
              <Text className="text-[13px] font-sans-semibold text-teal">
                Contact Support
              </Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
