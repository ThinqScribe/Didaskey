/**
 * Booking Steps 3 + 4 + 5 — Review, Payment Method & Confirm Payment
 *
 * Step 3: Review all booking details with full price breakdown
 * Step 4: Payment method display (Paystack handles the actual method selection)
 * Step 5: Confirm and launch Paystack payment sheet
 *
 * Flow:
 *   1. User reviews the booking summary
 *   2. Taps "Continue to Payment" → calls POST /bookings (creates booking server-side)
 *   3. Backend returns paystack_access_code + paystack_reference
 *   4. We open the server-created Paystack authorization URL
 *   5. On browser return → navigate to success screen
 *   6. The backend webhook confirms the booking independently
 *
 * Security:
 *   - Amount is NEVER sent to the backend — it is computed server-side
 *   - The paystack_reference from the backend is what Paystack signs
 *   - We use the reference returned by the backend, not one we generate
 */

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePaystack } from "react-native-paystack-webview";

import { Colors, Spacing } from "@/constants";
import { useAuthStore } from "@/lib/store/auth";
import {
  createBooking,
  getBooking,
  type SessionFormat,
  type BookingWithPaystack,
  sessionFormatLabel,
  formatBookingDate,
  formatBookingTimeRange,
  formatCurrency,
} from "@/lib/api/bookings";

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 3 | 4 | 5 }) {
  const steps = ["Session", "Schedule", "Review", "Payment"];
  return (
    <View className="flex-row items-center justify-center gap-1 py-3">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current || (current === 5 && idx === 4);
        return (
          <View key={label} className="flex-row items-center gap-1">
            <View
              className={`w-6 h-6 rounded-full items-center justify-center ${
                active ? "bg-deep-teal" : done ? "bg-teal" : "bg-muted"
              }`}
            >
              {done ? (
                <Ionicons name="checkmark" size={12} color={Colors.white} />
              ) : (
                <Text
                  className={`text-[10px] font-sans-bold ${
                    active ? "text-white" : "text-muted-foreground"
                  }`}
                >
                  {idx}
                </Text>
              )}
            </View>
            <Text
              className={`text-[10px] font-sans-medium ${
                active ? "text-charcoal" : "text-muted-foreground"
              }`}
            >
              {label}
            </Text>
            {i < steps.length - 1 && (
              <View className="w-4 h-px bg-border mx-0.5" />
            )}
          </View>
        );
      })}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-3 py-3 border-b border-border">
      <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
        <Ionicons name={icon as any} size={15} color={Colors.deepTeal} />
      </View>
      <Text className="flex-1 text-[13px] font-sans-medium text-muted-foreground">
        {label}
      </Text>
      <Text className="text-[13px] font-sans-semibold text-charcoal">
        {value}
      </Text>
    </View>
  );
}

function PriceRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text
        className={`text-[13px] ${
          bold ? "font-sans-bold text-charcoal" : "font-sans-medium text-muted-foreground"
        }`}
      >
        {label}
      </Text>
      <Text
        className={`text-[13px] ${
          highlight
            ? "font-sans-bold text-deep-teal"
            : bold
            ? "font-sans-bold text-charcoal"
            : "font-sans-medium text-charcoal"
        }`}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{
    tutorId: string;
    displayName: string;
    ratePerHour: string;
    currency: string;
    sessionFormat: string;
    duration: string;
    subjectId: string;
    subjectName: string;
    scheduledAt: string;
    tutorFee: string;
    platformFee: string;
    total: string;
    primarySubject: string;
  }>();

  const user = useAuthStore((s) => s.user);
  const { popup } = usePaystack();

  // ── Derived params ──────────────────────────────────────────────────────────

  const tutorId = Number(params.tutorId);
  const sessionFormat = (params.sessionFormat ?? "online") as SessionFormat;
  const duration = Number(params.duration ?? "60");
  const subjectId = params.subjectId ? Number(params.subjectId) : null;
  const scheduledAt = params.scheduledAt ?? "";
  const tutorFee = parseFloat(params.tutorFee ?? "0");
  const platformFee = parseFloat(params.platformFee ?? "0");
  const total = parseFloat(params.total ?? "0");
  const currency = params.currency ?? "NGN";

  // ── State ───────────────────────────────────────────────────────────────────

  const [step, setStep] = useState<3 | 4>(3);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<BookingWithPaystack | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Step 3 → 4: Create booking ──────────────────────────────────────────────

  const handleContinueToPayment = useCallback(async () => {
    if (!user?.email) {
      setError("You must be signed in to book a session.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await createBooking({
        tutor_id: tutorId,
        subject_id: subjectId,
        scheduled_at: scheduledAt,
        duration_minutes: duration,
        session_format: sessionFormat,
        student_note: null,
      });

      setBooking(created);
      setStep(4);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ??
        "Could not create the booking. Please try again.";
      setError(typeof detail === "string" ? detail : "Booking failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [tutorId, subjectId, scheduledAt, duration, sessionFormat, user?.email]);

  // ── Poll after Paystack sheet closes ───────────────────────────────────────

  const pollForConfirmation = useCallback(
    async (bookingId: number, reference: string) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const updated = await getBooking(bookingId);
        if (updated.status === "confirmed") {
          router.replace({
            pathname: `/booking/${tutorId}/success` as any,
            params: {
              bookingId: String(updated.id),
              displayName: params.displayName,
              subjectName: params.subjectName ?? "",
              scheduledAt: updated.scheduled_at,
              duration: String(updated.duration_minutes),
              sessionFormat: updated.session_format,
              amount: updated.amount,
              currency: updated.currency,
              reference,
            },
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Webhook hasn't fired yet — go to failed screen
      const latest = await getBooking(bookingId).catch(() => null);
      router.replace({
        pathname: `/booking/${tutorId}/failed` as any,
        params: {
          tutorId: String(tutorId),
          bookingId: String(bookingId),
          displayName: params.displayName,
          subjectName: params.subjectName ?? "",
          scheduledAt: scheduledAt,
          duration: String(duration),
          sessionFormat: sessionFormat,
          amount: String(latest?.amount ?? total),
          currency: latest?.currency ?? currency,
        },
      });
    },
    [tutorId, params, scheduledAt, duration, sessionFormat, total, currency]
  );

  // ── Step 4: Launch Paystack in-app WebView ──────────────────────────────────

  const handlePayNow = useCallback(() => {
    if (!booking || !user?.email) return;

    popup.checkout({
      email: user.email,
      // amount is in Naira (major units) — the library converts to kobo internally
      amount: parseFloat(booking.amount),
      reference: booking.paystack_reference,
      metadata: {
        custom_fields: [
          {
            display_name: "Booking ID",
            variable_name: "booking_id",
            value: String(booking.id),
          },
        ],
      },
      onSuccess: (_res) => {
        // Paystack WebView confirmed success — poll for webhook confirmation
        pollForConfirmation(booking.id, booking.paystack_reference);
      },
      onCancel: () => {
        setError("Payment was cancelled. Your booking slot is still reserved — tap Pay to try again.");
      },
    });
  }, [booking, user?.email, popup, pollForConfirmation]);

  // ── Formatted display values ────────────────────────────────────────────────

  const dateLabel = scheduledAt ? formatBookingDate(scheduledAt) : "—";
  const timeLabel = scheduledAt
    ? formatBookingTimeRange(scheduledAt, duration)
    : "—";
  const durationLabel = duration < 60 ? `${duration} min` : `${duration / 60} hour`;
  const formatLabel = sessionFormatLabel(sessionFormat);
  const subjectLabel =
    params.subjectName || params.primarySubject || "General";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View className="flex-row items-center px-5 pt-2 pb-1">
        <Pressable
          onPress={() => {
            if (step === 4) { setStep(3); setError(null); }
            else router.back();
          }}
          hitSlop={10}
          className="w-9 h-9 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={23} color={Colors.charcoal} />
        </Pressable>
        <Text className="flex-1 text-center text-[16px] font-sans-bold text-charcoal">
          {step === 3 ? "Review Your Booking" : "Payment"}
        </Text>
        <View className="w-9" />
      </View>

      <StepIndicator current={step} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 110 }}
      >
        {step === 3 ? (
          /* ── Step 3: Review ──────────────────────────────────────────────── */
          <View className="pt-2">
            <Text className="text-[16px] font-sans-bold text-charcoal mb-1">
              Review Your Booking
            </Text>
            <Text className="text-[13px] font-sans-medium text-muted-foreground mb-3">
              Please confirm your session details.
            </Text>

            {/* Tutor summary card */}
            <View className="bg-white rounded-xl border border-border px-4 py-4 mb-3">
              <View className="flex-row items-center gap-3 mb-1">
                <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
                  <Ionicons name="person" size={18} color={Colors.deepTeal} />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-sans-bold text-charcoal">
                    {params.displayName}
                  </Text>
                  <Text className="text-[12px] font-sans-medium text-muted-foreground">
                    {subjectLabel}
                  </Text>
                </View>
                <Text className="text-[15px] font-sans-bold text-charcoal">
                  {formatCurrency(parseFloat(params.ratePerHour ?? "0"), currency, 0)}
                  <Text className="text-[11px] font-sans-medium text-muted-foreground">
                    /hr
                  </Text>
                </Text>
              </View>
            </View>

            {/* Session details */}
            <View className="bg-white rounded-tl-3xl border border-border px-4 mb-3">
              <DetailRow icon="layers-outline" label="Session Type" value="1-on-1 Online" />
              <DetailRow icon="calendar-outline" label="Date" value={dateLabel} />
              <DetailRow icon="time-outline" label="Time" value={timeLabel} />
              <DetailRow icon="hourglass-outline" label="Duration" value={durationLabel} />
              <View className="flex-row items-center gap-3 py-3">
                <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                  <Ionicons name="laptop-outline" size={15} color={Colors.deepTeal} />
                </View>
                <Text className="flex-1 text-[13px] font-sans-medium text-muted-foreground">
                  Learning Format
                </Text>
                <Text className="text-[13px] font-sans-semibold text-charcoal">
                  {formatLabel}
                </Text>
              </View>
            </View>

            {/* Price breakdown */}
            <View className="bg-white rounded-tr-3xl border border-border px-4 py-3 mb-2">
              <Text className="text-[13px] font-sans-bold text-charcoal mb-1">
                Price Breakdown
              </Text>
              <PriceRow
                label={`Tutor Fee (${durationLabel})`}
                value={formatCurrency(tutorFee, currency)}
              />
              <PriceRow
                label="Platform Fee"
                value={formatCurrency(platformFee, currency)}
              />
              <View className="h-px bg-border my-2" />
              <PriceRow
                label="Total"
                value={formatCurrency(total, currency)}
                bold
                highlight
              />
            </View>

            {/* Error */}
            {!!error && (
              <View className="flex-row items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <Ionicons name="alert-circle-outline" size={16} color={Colors.destructive} />
                <Text className="flex-1 text-[13px] font-sans-medium text-destructive">
                  {error}
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* ── Step 4: Payment ─────────────────────────────────────────────── */
          <View className="pt-2">
            <Text className="text-[16px] font-sans-bold text-charcoal mb-1">
              Payment Method
            </Text>
            <Text className="text-[13px] font-sans-medium text-muted-foreground mb-5">
              Choose your preferred payment method.
            </Text>

            {/* Paystack option (primary) */}
            <Pressable
              onPress={handlePayNow}
              className="flex-row items-center bg-white rounded-xl border-0 border-border px-4 py-4 gap-3 mb-3 active:opacity-80"
            >
              <View className="w-10 h-10 rounded-xl bg-muted items-center justify-center">
                <Ionicons name="card-outline" size={20} color={Colors.deepTeal} />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-sans-bold text-charcoal">
                  Paystack
                </Text>
                <Text className="text-[12px] font-sans-medium text-muted-foreground">
                  Card, bank transfer, USSD & more
                </Text>
              </View>
              <View className="w-5 h-5 rounded-full border-2 border-deep-teal items-center justify-center">
                <View className="w-2.5 h-2.5 rounded-full bg-deep-teal" />
              </View>
            </Pressable>

            {/* Order summary */}
            <View className="bg-white rounded-tr-3xl rounded-bl-3xl border border-border px-4 py-3 mb-5 mt-2">
              <View className="flex-row items-center gap-3 mb-3">
                <View className="w-9 h-9 rounded-full bg-muted items-center justify-center">
                  <Ionicons name="person" size={16} color={Colors.deepTeal} />
                </View>
                <View>
                  <Text className="text-[13px] font-sans-bold text-charcoal">
                    {params.displayName}
                  </Text>
                  <Text className="text-[11px] font-sans-medium text-muted-foreground">
                    {subjectLabel}
                  </Text>
                </View>
              </View>

              <View className="h-px bg-border mb-3" />

              <View className="gap-1.5">
                <InfoLine label="Date" value={dateLabel} />
                <InfoLine label="Time" value={timeLabel} />
                <InfoLine label="Duration" value={durationLabel} />
                <InfoLine label="Session Type" value={`1-on-1 · ${formatLabel}`} />
              </View>

              <View className="h-px bg-border my-3" />

              <View className="flex-row items-center justify-between">
                <Text className="text-[14px] font-sans-bold text-charcoal">
                  Total Amount
                </Text>
                <Text className="text-[18px] font-sans-bold text-deep-teal">
                  {formatCurrency(booking ? booking.amount : total, booking?.currency ?? currency)}
                </Text>
              </View>
              <Text className="text-[11px] font-sans-medium text-muted-foreground mt-0.5">
                Includes all fees
              </Text>
            </View>

            {/* Error */}
            {!!error && (
              <View className="flex-row items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <Ionicons name="alert-circle-outline" size={16} color={Colors.destructive} />
                <Text className="flex-1 text-[13px] font-sans-medium text-destructive">
                  {error}
                </Text>
              </View>
            )}

            {/* Security note */}
            <View className="flex-row items-center justify-center gap-1.5">
              <Ionicons name="lock-closed-outline" size={13} color={Colors.mutedForeground} />
              <Text className="text-[11px] font-sans-medium text-muted-foreground">
                Secure and encrypted payment
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View
        className="absolute rounded-2xl mx-2 bottom-0 left-0 right-0 bg-background border-t border-border"
        style={{
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingHorizontal: Spacing.xl,
          paddingTop: 14,
          paddingBottom: 24,
        }}
      >
        {step === 3 ? (
          <Pressable
            onPress={handleContinueToPayment}
            disabled={loading}
            className="rounded-xl bg-deep-teal items-center py-4 active:opacity-80"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text className="text-[15px] font-sans-bold text-white">
                Continue to Payment
              </Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={handlePayNow}
            className="rounded-xl bg-deep-teal items-center py-4 active:opacity-80"
          >
            <Text className="text-[15px] font-sans-bold text-white">
              Pay Securely {formatCurrency(booking ? booking.amount : total, booking?.currency ?? currency)}
            </Text>
          </Pressable>
        )}

        <Text
          className="text-[11px] font-sans-medium text-muted-foreground text-center mt-3 mb-0"
          style={{ lineHeight: 16 }}
        >
          By proceeding, you agree to our{" "}
          <Text className="text-teal">Terms of Service</Text> and{" "}
          <Text className="text-teal">Cancellation Policy</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[12px] font-sans-medium text-muted-foreground">
        {label}
      </Text>
      <Text className="text-[12px] font-sans-semibold text-charcoal">{value}</Text>
    </View>
  );
}