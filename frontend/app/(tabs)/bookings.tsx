import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import PaystackWebViewModal from "@/components/payment/PaystackWebViewModal";
import { Colors, TabBar } from "@/constants";
import { LoadingState, Rise, ScreenFade } from "@/components/ui/Motion";
import { useRefresh } from "@/lib/hooks/useRefresh";
import {
  cancelBooking,
  formatBookingTimeRange,
  formatCurrency,
  getBooking,
  initiatePayment,
  listBookings,
  sessionFormatLabel,
  type BookingResponse,
  type BookingStatus,
} from "@/lib/api/bookings";

const NAVY = "#071D3A";
const LIME = "#BFFF4B";
const MUTED_NAVY = "#66718E";

const STATUS_TABS: { label: string; value: BookingStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Upcoming", value: "confirmed" },
  { label: "Pending", value: "pending_payment" },
  { label: "Past", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

function statusLabel(status: BookingStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "pending_payment":
      return "Pending";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No show";
    default:
      return status;
  }
}

function statusTint(status: BookingStatus) {
  switch (status) {
    case "confirmed":
      return "#18C86F";
    case "pending_payment":
      return Colors.gold;
    case "completed":
      return Colors.teal;
    case "cancelled":
      return Colors.destructive;
    default:
      return MUTED_NAVY;
  }
}

function statusSoftTint(status: BookingStatus) {
  switch (status) {
    case "confirmed":
      return "#E7FAF1";
    case "pending_payment":
      return "#FFF4D6";
    case "completed":
      return "#E9F8F5";
    case "cancelled":
      return "#FFECEA";
    default:
      return "#EFF2F6";
  }
}

function dateParts(isoString: string) {
  const date = new Date(isoString);
  return {
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: date.toLocaleDateString("en-US", { day: "2-digit" }),
    long: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
  };
}

function daysUntil(isoString: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoString);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < -1) return `${Math.abs(days)} days ago`;
  return `In ${days} days`;
}

function isThisMonth(isoString: string) {
  const now = new Date();
  const target = new Date(isoString);
  return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
}

function isTodayOrFuture(isoString: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(isoString).getTime() >= today.getTime();
}

function canCancel(booking: BookingResponse) {
  return booking.status === "confirmed" || booking.status === "pending_payment";
}

function Header({ count }: { count: number }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>Learning hub</Text>
        <Text style={styles.title}>My bookings</Text>
        <Text style={styles.subtitle}>Keep your next lesson within reach.</Text>
      </View>
      <View style={styles.headerCalendar}>
        <Ionicons name="calendar-outline" size={28} color={NAVY} />
        <View style={styles.notificationDot} />
      </View>
      <View style={styles.headerMeta}>
        <Text style={styles.sessionCount}>{count} session{count === 1 ? "" : "s"}</Text>
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.calendarLink, pressed && styles.pressed]}>
          <Text style={styles.calendarLinkText}>View calendar</Text>
          <Ionicons name="chevron-forward" size={23} color={NAVY} />
        </Pressable>
      </View>
    </View>
  );
}

function StatusTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: BookingStatus | undefined;
  setActiveTab: (value: BookingStatus | undefined) => void;
}) {
  return (
    <View style={styles.filterBlock}>
      <Text style={styles.filterLabel}>Filter sessions</Text>
      <View style={styles.segment}>
        {STATUS_TABS.map((tab, index) => {
          const active = activeTab === tab.value;
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setActiveTab(tab.value)}
              style={({ pressed }) => [styles.segmentItem, pressed && styles.pressed]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{tab.label}</Text>
              {active && <View style={styles.segmentUnderline} />}
              {index < STATUS_TABS.length - 1 && <View style={styles.segmentDivider} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FeaturedBooking({
  booking,
  onCancel,
  onPay,
  paying,
  cancelling,
}: {
  booking: BookingResponse;
  onCancel: (id: number) => void;
  onPay: (id: number) => void;
  paying: boolean;
  cancelling: boolean;
}) {
  const date = dateParts(booking.scheduled_at);
  const amount = formatCurrency(booking.amount, booking.currency);
  const status = statusLabel(booking.status);
  const statusColor = statusTint(booking.status);
  const isPending = booking.status === "pending_payment";

  return (
    <View style={styles.featuredCard}>
      <View style={styles.featuredTop}>
        <Text style={styles.featuredEyebrow}>Next lesson</Text>
      </View>
      <View style={styles.featuredMain}>
        <View style={styles.featuredDate}>
          <Text style={styles.featuredMonth}>{date.month}</Text>
          <Text style={styles.featuredDay}>{date.day}</Text>
        </View>
        <View style={styles.featuredInfo}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}26` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText}>{status}</Text>
          </View>
          <Text style={styles.featuredTutor} numberOfLines={1}>{booking.tutor_name}</Text>
          <View style={styles.subjectRow}>
            <Ionicons name={booking.session_format === "online" ? "videocam-outline" : "location-outline"} size={18} color="#BCD2EA" />
            <Text style={styles.featuredSubject} numberOfLines={1}>
              {booking.subject_name ?? "General session"} · {sessionFormatLabel(booking.session_format)}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.featuredTime}>{formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}</Text>
          <Text style={styles.featuredDateLong}>{date.long}</Text>
        </View>
        <View style={styles.daysPill}>
          <Ionicons name="time-outline" size={18} color="#CFE0F2" />
          <Text style={styles.daysPillText}>{daysUntil(booking.scheduled_at)}</Text>
        </View>
      </View>
      <View style={styles.featuredDivider} />
      <View style={styles.featuredFooter}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{amount}</Text>
        </View>
        <View style={styles.featuredActions}>
          <Pressable
            accessibilityRole="button"
            disabled={paying}
            onPress={() => isPending ? onPay(booking.id) : router.push(`/learning/${booking.id}`)}
            style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed, paying && styles.disabled]}
          >
            {paying ? <ActivityIndicator color={NAVY} /> : (
              <>
                <Text style={styles.detailsButtonText}>{isPending ? "Pay now" : "View details"}</Text>
                <Ionicons name="arrow-forward" size={18} color={NAVY} />
              </>
            )}
          </Pressable>
          {canCancel(booking) && (
            <Pressable
              accessibilityRole="button"
              disabled={cancelling}
              onPress={() => onCancel(booking.id)}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed, cancelling && styles.disabled]}
            >
              {cancelling ? <ActivityIndicator color="#FF6F74" /> : <Text style={styles.cancelText}>Cancel</Text>}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function LaterBooking({
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
  const date = dateParts(booking.scheduled_at);
  const isPending = booking.status === "pending_payment";
  const statusColor = statusTint(booking.status);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => isPending ? onPay(booking.id) : router.push(`/learning/${booking.id}`)}
      style={({ pressed }) => [styles.laterRow, pressed && styles.pressed]}
    >
      <View style={styles.laterDate}>
        <Text style={styles.laterMonth}>{date.month}</Text>
        <Text style={styles.laterDay}>{date.day}</Text>
      </View>
      <View style={styles.laterCopy}>
        <Text style={styles.laterTutor} numberOfLines={1}>{booking.tutor_name}</Text>
        <View style={styles.laterSubjectRow}>
          <Ionicons name={booking.session_format === "online" ? "videocam-outline" : "location-outline"} size={15} color="#386184" />
          <Text style={styles.laterSubject} numberOfLines={1}>
            {booking.subject_name ?? "General"} · {sessionFormatLabel(booking.session_format)}
          </Text>
        </View>
        <View style={styles.laterStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.laterStatus, { backgroundColor: statusSoftTint(booking.status), color: statusColor }]}>
            {statusLabel(booking.status)}
          </Text>
        </View>
        <Text style={styles.laterTime}>{formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}</Text>
        <Text style={styles.laterAmount}>{formatCurrency(booking.amount, booking.currency)}</Text>
      </View>
      <View style={styles.laterRight}>
        <View style={styles.laterDays}>
          <Ionicons name="time-outline" size={17} color={NAVY} />
          <Text style={styles.laterDaysText}>{isPending && paying ? "Paying" : daysUntil(booking.scheduled_at)}</Text>
        </View>
        <View style={styles.laterActionRow}>
          {canCancel(booking) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel booking"
              hitSlop={8}
              onPress={() => onCancel(booking.id)}
              style={({ pressed }) => [styles.laterCancel, pressed && styles.pressed]}
            >
              <Text style={styles.laterCancelText}>Cancel</Text>
            </Pressable>
          ) : null}
          <Ionicons name="chevron-forward" size={23} color={NAVY} />
        </View>
      </View>
    </Pressable>
  );
}

function CalendarBanner() {
  return (
    <View style={styles.calendarBanner}>
      <View style={styles.bannerIcon}>
        <Ionicons name="calendar-outline" size={27} color={NAVY} />
      </View>
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerTitle}>Never miss a lesson</Text>
        <Text style={styles.bannerText}>Add your sessions to your device calendar</Text>
      </View>
      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.bannerAction, pressed && styles.pressed]}>
        <Text style={styles.bannerActionText}>Sync calendar</Text>
        <Ionicons name="chevron-forward" size={23} color={NAVY} />
      </Pressable>
    </View>
  );
}

function EmptyBookings({
  activeTab,
  scopedOut,
}: {
  activeTab: BookingStatus | undefined;
  scopedOut?: boolean;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Ionicons name="calendar-outline" size={34} color={NAVY} />
      </View>
      <Text style={styles.emptyTitle}>
        {scopedOut ? "No sessions this month" : activeTab ? `No ${statusLabel(activeTab)} bookings` : "No bookings yet"}
      </Text>
      <Text style={styles.emptyText}>
        {scopedOut
          ? "Switch to All months to see the rest of your bookings."
          : activeTab ? "Try a different filter or book a new session." : "Book a session with a tutor to start learning."}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(tabs)/search")}
        style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}
      >
        <Text style={styles.emptyButtonText}>Find a tutor</Text>
      </Pressable>
    </View>
  );
}

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<BookingStatus | undefined>("confirmed");
  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [paying, setPaying] = useState<number | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [webViewVisible, setWebViewVisible] = useState(false);
  const [monthScope, setMonthScope] = useState<"this_month" | "all">("this_month");

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listBookings({ status: activeTab, page: 1, page_size: 50 });
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

  const visibleBookings = useMemo(
    () => {
      const scopedBookings = monthScope === "this_month"
        ? bookings.filter(booking => isThisMonth(booking.scheduled_at))
        : bookings;
      return [...scopedBookings].sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    },
    [bookings, monthScope],
  );
  const nextBooking = useMemo(() => {
    if (activeTab === "completed" || activeTab === "cancelled") return undefined;
    return visibleBookings.find(booking => isTodayOrFuture(booking.scheduled_at));
  }, [activeTab, visibleBookings]);
  const laterBookings = useMemo(
    () => nextBooking ? visibleBookings.filter(booking => booking.id !== nextBooking.id) : visibleBookings,
    [nextBooking, visibleBookings],
  );

  const handleCancel = useCallback(async (bookingId: number) => {
    setCancelling(bookingId);
    try {
      await cancelBooking(bookingId, { reason: "Cancelled by student" });
      await fetchBookings();
    } catch (err: any) {
      const detail = typeof err?.response?.data?.detail === "string"
        ? err.response.data.detail
        : "This booking may be inside the 24-hour cancellation window or is no longer cancellable.";
      Alert.alert("Could not cancel booking", detail);
    } finally {
      setCancelling(null);
    }
  }, [fetchBookings]);

  const askCancel = useCallback((bookingId: number) => {
    Alert.alert("Cancel booking?", "This session will be cancelled and may not be refundable.", [
      { text: "Keep booking", style: "cancel" },
      { text: "Cancel booking", style: "destructive", onPress: () => void handleCancel(bookingId) },
    ]);
  }, [handleCancel]);

  const handlePay = useCallback(async (bookingId: number) => {
    setPaying(bookingId);
    try {
      const payment = await initiatePayment(bookingId);
      if (!payment.authorization_url) throw new Error("No payment URL returned");
      setPaymentUrl(payment.authorization_url);
      setWebViewVisible(true);
    } catch (error: any) {
      console.error("Payment initiation failed:", error);
      setPaying(null);
      setPaymentUrl(null);
      setWebViewVisible(false);
      const message = error?.response?.status === 500
        ? "Payment service is temporarily unavailable. Please try again later."
        : "Could not initiate payment. Please try again in a moment.";
      Alert.alert("Payment Error", message);
    }
  }, []);

  const handlePaymentSuccess = useCallback(async () => {
    setWebViewVisible(false);
    const bookingId = paying;
    if (!bookingId) return;

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

    for (let attempt = 0; attempt < 15; attempt += 1) {
      try {
        const updated = await getBooking(bookingId);
        if (updated.status === "confirmed") {
          goToSuccess(updated);
          return;
        }
      } catch {
        // keep polling
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    setPaying(null);
    Alert.alert("Payment processing", "We are still confirming your payment. Check your bookings shortly. Do not pay again while confirmation is pending.");
  }, [paying]);

  const handlePaymentCancel = useCallback(() => {
    setWebViewVisible(false);
    setPaying(null);
    Alert.alert("Payment cancelled", "Your booking slot is still reserved — tap 'Pay now' to try again.");
  }, []);

  const handlePaymentDismiss = useCallback(() => {
    setWebViewVisible(false);
    setPaying(null);
  }, []);

  const listHeader = (
    <ScreenFade>
      <Header count={visibleBookings.length} />
      <Rise delay={60}>
        <StatusTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      </Rise>
      {nextBooking && (
        <Rise delay={110}>
          <FeaturedBooking
            booking={nextBooking}
            onCancel={askCancel}
            onPay={handlePay}
            paying={paying === nextBooking.id}
            cancelling={cancelling === nextBooking.id}
          />
        </Rise>
      )}
      {(nextBooking || bookings.length > 0) && (
        <Rise delay={150}>
          <View style={styles.laterHeader}>
            <View>
              <Text style={styles.laterTitle}>{nextBooking ? "Later" : "Sessions"}</Text>
              <Text style={styles.laterSubtitle}>
                {monthScope === "this_month" ? "Only sessions in this month" : "Showing every month"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle month filter"
              onPress={() => setMonthScope(scope => scope === "this_month" ? "all" : "this_month")}
              style={({ pressed }) => [styles.monthPill, pressed && styles.pressed]}
            >
              <Text style={styles.monthPillText}>{monthScope === "this_month" ? "This month" : "All months"}</Text>
              <Ionicons name="chevron-down" size={18} color={NAVY} />
            </Pressable>
          </View>
        </Rise>
      )}
    </ScreenFade>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <LoadingState />
        </View>
      ) : (
        <FlatList
          data={laterBookings}
          keyExtractor={item => String(item.id)}
          ListHeaderComponent={listHeader}
          renderItem={({ item, index }) => (
            <Rise delay={Math.min(240, 40 + index * 35)}>
              <LaterBooking
                booking={item}
                onCancel={askCancel}
                onPay={handlePay}
                paying={paying === item.id}
              />
            </Rise>
          )}
          ListEmptyComponent={!nextBooking ? (
            <EmptyBookings
              activeTab={activeTab}
              scopedOut={bookings.length > 0 && visibleBookings.length === 0}
            />
          ) : null}
          ListFooterComponent={nextBooking ? <CalendarBanner /> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.teal} colors={[Colors.teal]} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: TabBar.height + insets.bottom + 34 }]}
        />
      )}

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

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    marginBottom: 18,
  },
  headerCopy: {
    maxWidth: 320,
  },
  eyebrow: {
    textTransform: "uppercase",
    fontFamily: "sans-bold",
    fontSize: 12,
    color: MUTED_NAVY,
  },
  title: {
    marginTop: 6,
    fontFamily: "sans-bold",
    fontSize: 30,
    lineHeight: 34,
    color: NAVY,
  },
  subtitle: {
    marginTop: 6,
    fontFamily: "sans-medium",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  headerCalendar: {
    position: "absolute",
    top: 0,
    right: 4,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notificationDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: LIME,
  },
  headerMeta: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sessionCount: {
    fontFamily: "sans-medium",
    fontSize: 15,
    color: NAVY,
  },
  calendarLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  calendarLinkText: {
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: NAVY,
  },
  filterBlock: {
    marginBottom: 16,
  },
  filterLabel: {
    marginBottom: 10,
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  segment: {
    minHeight: 46,
    borderRadius: 8,
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: {
    fontFamily: "sans-medium",
    fontSize: 12,
    color: MUTED_NAVY,
  },
  segmentTextActive: {
    fontFamily: "sans-bold",
    color: NAVY,
  },
  segmentUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: LIME,
  },
  segmentDivider: {
    position: "absolute",
    right: 0,
    top: 11,
    bottom: 11,
    width: 1,
    backgroundColor: Colors.border,
  },
  featuredCard: {
    borderRadius: 8,
    padding: 15,
    marginBottom: 24,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 3,
  },
  featuredTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  featuredEyebrow: {
    textTransform: "uppercase",
    fontFamily: "sans-bold",
    fontSize: 12,
    color: "#B9CBE2",
  },
  featuredMain: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
  },
  featuredDate: {
    width: 58,
    height: 62,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  featuredMonth: {
    fontFamily: "sans-semibold",
    fontSize: 12,
    color: "#DCE6F2",
  },
  featuredDay: {
    fontFamily: "sans-bold",
    fontSize: 27,
    lineHeight: 29,
    color: "#FFFFFF",
  },
  featuredInfo: {
    flex: 1,
    minWidth: 0,
  },
  statusPill: {
    alignSelf: "flex-start",
    minHeight: 28,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  statusDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: "sans-semibold",
    fontSize: 12,
    color: "#E6EFF8",
  },
  featuredTutor: {
    marginTop: 7,
    fontFamily: "sans-bold",
    fontSize: 19,
    lineHeight: 24,
    color: "#FFFFFF",
  },
  subjectRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  featuredSubject: {
    flex: 1,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: "#BCD2EA",
  },
  timeRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  featuredTime: {
    fontFamily: "sans-bold",
    fontSize: 22,
    lineHeight: 27,
    color: "#FFFFFF",
  },
  featuredDateLong: {
    marginTop: 4,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: "#BCD2EA",
  },
  daysPill: {
    minHeight: 34,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  daysPillText: {
    fontFamily: "sans-medium",
    fontSize: 12,
    color: "#E6EFF8",
  },
  featuredDivider: {
    height: 1,
    marginTop: 18,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  featuredFooter: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  totalLabel: {
    fontFamily: "sans-medium",
    fontSize: 12,
    color: "#BCD2EA",
  },
  totalAmount: {
    fontFamily: "sans-bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  featuredActions: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  detailsButton: {
    minHeight: 42,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    backgroundColor: LIME,
  },
  detailsButtonText: {
    fontFamily: "sans-bold",
    fontSize: 14,
    color: NAVY,
  },
  cancelButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  cancelText: {
    fontFamily: "sans-bold",
    fontSize: 14,
    color: "#FF6F74",
  },
  laterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  laterTitle: {
    fontFamily: "sans-bold",
    fontSize: 24,
    color: NAVY,
  },
  laterSubtitle: {
    marginTop: 2,
    fontFamily: "sans-medium",
    fontSize: 12,
    color: MUTED_NAVY,
  },
  monthPill: {
    minHeight: 34,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  monthPillText: {
    fontFamily: "sans-semibold",
    fontSize: 13,
    color: NAVY,
  },
  laterRow: {
    minHeight: 118,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.06)",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
  laterDate: {
    width: 54,
    height: 64,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.06)",
  },
  laterMonth: {
    fontFamily: "sans-semibold",
    fontSize: 12,
    color: NAVY,
  },
  laterDay: {
    fontFamily: "sans-bold",
    fontSize: 24,
    lineHeight: 27,
    color: NAVY,
  },
  laterCopy: {
    flex: 1,
    minWidth: 0,
  },
  laterTutor: {
    fontFamily: "sans-bold",
    fontSize: 16,
    color: NAVY,
  },
  laterSubjectRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  laterSubject: {
    flex: 1,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  laterStatusRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  laterStatus: {
    fontFamily: "sans-medium",
    fontSize: 12,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  laterTime: {
    marginTop: 6,
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: NAVY,
  },
  laterAmount: {
    marginTop: 2,
    fontFamily: "sans-bold",
    fontSize: 14,
    color: NAVY,
  },
  laterRight: {
    width: 86,
    minHeight: 92,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  laterDays: {
    minHeight: 32,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    backgroundColor: Colors.muted,
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.05)",
  },
  laterDaysText: {
    fontFamily: "sans-medium",
    fontSize: 12,
    color: NAVY,
  },
  laterActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  laterCancel: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  laterCancelText: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: Colors.destructive,
  },
  calendarBanner: {
    minHeight: 82,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    padding: 14,
    backgroundColor: Colors.paleTeal,
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.06)",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 1,
  },
  bannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  bannerTitle: {
    fontFamily: "sans-bold",
    fontSize: 15,
    color: NAVY,
  },
  bannerText: {
    marginTop: 3,
    fontFamily: "sans-medium",
    fontSize: 12,
    color: MUTED_NAVY,
  },
  bannerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  bannerActionText: {
    fontFamily: "sans-semibold",
    fontSize: 13,
    color: NAVY,
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: 58,
  },
  emptyIcon: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F2",
  },
  emptyTitle: {
    marginTop: 18,
    fontFamily: "sans-bold",
    fontSize: 20,
    color: NAVY,
  },
  emptyText: {
    marginTop: 8,
    maxWidth: 280,
    textAlign: "center",
    fontFamily: "sans-medium",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  emptyButton: {
    marginTop: 24,
    minHeight: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: NAVY,
  },
  emptyButtonText: {
    fontFamily: "sans-bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
});
