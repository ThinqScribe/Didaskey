import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { router } from "expo-router";

import PaystackWebViewModal from "@/components/payment/PaystackWebViewModal";
import { JoinSessionButton } from "@/components/classroom/JoinSessionButton";

import { Colors, Spacing, TabBar } from "@/constants";
import { useRefresh } from "@/lib/hooks/useRefresh";

import {
  listBookings,
  cancelBooking,
  getBooking,
  initiatePayment,
  formatBookingDate,
  formatBookingTimeRange,
  formatCurrency,
  sessionFormatLabel,
  type BookingResponse,
  type BookingStatus,
} from "@/lib/api/bookings";

// ─────────────────────────────────────────────────────────────────────────────
// Status configuration
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_TABS: {
  label: string;
  value: BookingStatus | undefined;
}[] = [
  { label: "All", value: undefined },
  { label: "Upcoming", value: "confirmed" },
  { label: "Pending", value: "pending_payment" },
  { label: "Past", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function statusColor(status: BookingStatus): string {
  switch (status) {
    case "confirmed":
      return Colors.teal;

    case "pending_payment":
      return Colors.gold;

    case "completed":
      return Colors.deepTeal;

    case "cancelled":
      return Colors.destructive;

    case "no_show":
      return Colors.mutedForeground;

    default:
      return Colors.mutedForeground;
  }
}

function statusLabel(status: BookingStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";

    case "pending_payment":
      return "Pending Payment";

    case "completed":
      return "Completed";

    case "cancelled":
      return "Cancelled";

    case "no_show":
      return "No Show";

    default:
      return status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Booking Card
// ─────────────────────────────────────────────────────────────────────────────

function BookingCard({
  booking,
  onCancel,
  onPay,
  paying,
}: {
  booking: BookingResponse;
  onCancel: (id: number) => void;
  onPay: (id: number) => void;
  paying: boolean;
}) {
  const dateLabel = formatBookingDate(booking.scheduled_at);

  const timeLabel = formatBookingTimeRange(
    booking.scheduled_at,
    booking.duration_minutes
  );

  const formatLabel = sessionFormatLabel(booking.session_format);

  const amount = parseFloat(booking.amount);

  const canCancel =
    booking.status === "confirmed" ||
    booking.status === "pending_payment";

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
    <View className="bg-white rounded-tr-2xl rounded-bl-2xl border border-border px-4 py-4 mb-3">
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

          {/* Tutor */}
          <View>
            <Text className="text-[13px] font-sans-bold text-charcoal">
              {booking.tutor_name}
            </Text>

            <Text className="text-[11px] font-sans-medium text-muted-foreground mt-0.5">
              {booking.subject_name ?? "General session"}
            </Text>

            <View className="flex-row items-center gap-1 mt-1">
              <Ionicons
                name="videocam-outline"
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
            backgroundColor: `${statusColor(booking.status)}18`,
          }}
        >
          <Text
            className="text-[11px] font-sans-bold"
            style={{
              color: statusColor(booking.status),
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
        <View>
          <Text className="text-[10px] font-sans-medium text-muted-foreground">
            TOTAL
          </Text>

          <Text className="text-[15px] font-sans-bold text-deep-teal">
            {formatCurrency(amount, booking.currency)}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {booking.status === "pending_payment" && (
            <Pressable
              onPress={() => onPay(booking.id)}
              disabled={paying}
              className="rounded-full bg-gold px-3 py-1.5 active:opacity-70"
            >
              {paying ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text className="text-[12px] font-sans-bold text-white">
                  Awaiting payment
                </Text>
              )}
            </Pressable>
          )}

          <JoinSessionButton booking={booking} counterpartName={booking.tutor_name} />

          {canCancel && (
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Cancel booking?",
                  "This session will be cancelled and may not be refundable.",
                  [
                    { text: "Keep booking", style: "cancel" },
                    {
                      text: "Cancel booking",
                      style: "destructive",
                      onPress: () => onCancel(booking.id),
                    },
                  ]
                )
              }
              hitSlop={8}
              className="rounded-full border border-border px-3 py-1.5 active:opacity-70"
            >
              <Text className="text-[12px] font-sans-semibold text-destructive">
                Cancel
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<
    BookingStatus | undefined
  >(undefined);

  const [bookings, setBookings] = useState<BookingResponse[]>([]);

  const [loading, setLoading] = useState(true);

  const [cancelling, setCancelling] = useState<number | null>(null);
  const [paying, setPaying] = useState<number | null>(null);

  const [headerHeight, setHeaderHeight] = useState(0);

  // WebView payment modal state
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [webViewVisible, setWebViewVisible] = useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Fetch bookings
  // ───────────────────────────────────────────────────────────────────────────

  const fetchBookings = useCallback(async () => {
    setLoading(true);

    try {
      const data = await listBookings({
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
  }, [activeTab]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const { refreshing, onRefresh } = useRefresh(fetchBookings);

  // ───────────────────────────────────────────────────────────────────────────
  // Cancel booking
  // ───────────────────────────────────────────────────────────────────────────

  const handleCancel = useCallback(
    async (bookingId: number) => {
      setCancelling(bookingId);

      try {
        await cancelBooking(bookingId, {
          reason: "Cancelled by student",
        });

        await fetchBookings();
      } catch (err: any) {
        const detail: string =
          typeof err?.response?.data?.detail === "string"
            ? err.response.data.detail
            : "This booking may be inside the 24-hour cancellation window or is no longer cancellable.";

        Alert.alert("Could not cancel booking", detail);
      } finally {
        setCancelling(null);
      }
    },
    [fetchBookings]
  );

  const handlePay = useCallback(
    async (bookingId: number) => {
      setPaying(bookingId);

      try {
        const payment = await initiatePayment(bookingId);

        if (!payment.authorization_url) {
          throw new Error("No payment URL returned");
        }

        // Open in-app WebView modal only if we have a valid URL
        setPaymentUrl(payment.authorization_url);
        setWebViewVisible(true);
      } catch (error: any) {
        console.error("Payment initiation failed:", error);
        setPaying(null);
        // Clear any stale payment URL
        setPaymentUrl(null);
        setWebViewVisible(false);
        
        const message = error?.response?.status === 500 
          ? "Payment service is temporarily unavailable. Please try again later."
          : "Could not initiate payment. Please try again in a moment.";
          
        Alert.alert("Payment Error", message);
      }
    },
    []
  );

  const handlePaymentSuccess = useCallback(async () => {
    setWebViewVisible(false);

    // Capture bookingId synchronously before any state changes.
    const bookingId = paying;
    if (!bookingId) return;

    // Find the booking snapshot for fallback params.

    // Helper that navigates to the success screen.
    // Uses router.push (not replace) so it sits on top of the tabs stack.
    const goToSuccess = (b: BookingResponse) => {
      setPaying(null);
      router.push({
        pathname: `/booking/${b.tutor_id}/success` as any,
        params: {
          bookingId: String(b.id),
          displayName: b.tutor_name,
          subjectName: b.subject_name ?? "",
          scheduledAt: String(b.scheduled_at),
          duration: String(b.duration_minutes),
          sessionFormat: b.session_format,
          amount: String(b.amount),
          currency: b.currency,
          reference: b.transaction?.paystack_reference ?? "",
        },
      });
    };

    // Poll for webhook confirmation — the webhook may arrive within a few seconds.
    for (let attempt = 0; attempt < 15; attempt += 1) {
      try {
        const updated = await getBooking(bookingId);
        if (updated.status === "confirmed") {
          goToSuccess(updated);
          return;
        }
      } catch {
        // network blip — keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    setPaying(null);
    Alert.alert("Payment processing", "We are still confirming your payment. Check your bookings shortly. Do not pay again while confirmation is pending.");
  }, [paying]);

  const handlePaymentCancel = useCallback(() => {
    setWebViewVisible(false);
    setPaying(null);
    Alert.alert(
      "Payment cancelled",
      "Your booking slot is still reserved — tap 'Awaiting payment' to try again."
    );
  }, []);

  // User dismissed the modal (× button or back) without Paystack signalling cancel.
  // Keep paying state intact so the button stays active for a retry.
  const handlePaymentDismiss = useCallback(() => {
    setWebViewVisible(false);
    setPaying(null);
  }, []);

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

  const listBottomPadding =
    TabBar.height +
    insets.bottom +
    Spacing.lg; // Reduced from Spacing.xxl + Spacing.xl to just Spacing.lg

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
      className="flex-1"
      style={{ backgroundColor: Colors.background }}
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
                Learning hub
              </Text>

              <Text className="text-[26px] font-sans-bold text-charcoal mt-1">
                My Bookings
              </Text>

              <Text className="text-[13px] font-sans-medium text-muted-foreground mt-1">
                Keep your next lesson within reach.
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
            data={STATUS_TABS}
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
        <View style={{ height: listHeight }} className="items-center justify-center">
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
            {activeTab
              ? `No ${statusLabel(
                  activeTab as BookingStatus
                )} bookings`
              : "No bookings yet"}
          </Text>

          <Text className="text-[14px] font-sans-medium text-muted-foreground text-center mb-8">
            {activeTab
              ? "Try a different filter or book a new session."
              : "Book a session with a tutor to get\nstarted on your learning journey."}
          </Text>

          <Pressable
            onPress={() =>
              router.push("/(tabs)/search")
            }
            className="rounded-full bg-deep-teal px-8 py-3.5 active:opacity-80"
          >
            <Text className="text-[15px] font-sans-bold text-white">
              Find a Tutor
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(booking) =>
            String(booking.id)
          }
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
            <BookingCard
              booking={item}
              onCancel={
                cancelling === null
                  ? handleCancel
                  : () => {}
              }
              onPay={handlePay}
              paying={paying === item.id}
            />
          )}
        />
      )}

      {/* Paystack WebView Modal */}
      {paymentUrl && webViewVisible && (
        <PaystackWebViewModal
          url={paymentUrl}
          visible={webViewVisible}
          onSuccess={handlePaymentSuccess}
          onCancel={handlePaymentCancel}
          onDismiss={handlePaymentDismiss}
        />
      )}
    </SafeAreaView>
  );
}
