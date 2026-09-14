import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { Colors, TabBar } from "@/constants";
import { useAuthStore } from "@/lib/store/auth";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { uploadAvatar } from "@/lib/api/auth";
import {
  formatBookingTimeRange,
  formatCurrency,
  type BookingResponse,
  type BookingStatus,
} from "@/lib/api/bookings";
import {
  dayLabel,
  getMyTutorProfile,
  getTutorStats,
  listTutorBookings,
  updateMyProfile,
  type TutorStats,
} from "@/lib/api/tutor-portal";
import type { TutorDetail } from "@/lib/api/tutors";

const NAVY = "#071D3A";
const MUTED_NAVY = "#66718E";
const LIME = "#BFFF4B";
const CARD_BORDER = Colors.border;

function compactDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function teachingModeLabel(mode?: TutorDetail["teaching_mode"]) {
  if (mode === "both") return "Online & in person";
  if (mode === "in_person") return "In person";
  return "Online";
}

function verificationLabel(status?: TutorDetail["verification_status"]) {
  if (status === "verified") return "Verified tutor";
  if (status === "rejected") return "Needs review";
  return "Verification pending";
}

function verificationIcon(status?: TutorDetail["verification_status"]): keyof typeof Ionicons.glyphMap {
  if (status === "verified") return "checkmark-circle";
  if (status === "rejected") return "alert-circle";
  return "time-outline";
}

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
    case "completed":
      return Colors.teal;
    case "cancelled":
      return Colors.destructive;
    case "pending_payment":
      return Colors.gold;
    default:
      return MUTED_NAVY;
  }
}

function subjectIcon(subject?: string | null): keyof typeof Ionicons.glyphMap {
  const normalized = subject?.toLowerCase() ?? "";
  if (normalized.includes("chem")) return "flask-outline";
  if (normalized.includes("phys")) return "planet-outline";
  if (normalized.includes("math")) return "calculator-outline";
  if (normalized.includes("bio")) return "leaf-outline";
  if (normalized.includes("english")) return "book-outline";
  return "school-outline";
}

function subjectIconTint(subject?: string | null) {
  const normalized = subject?.toLowerCase() ?? "";
  if (normalized.includes("phys")) return { bg: "#EAF0FF", fg: "#0C35B8" };
  if (normalized.includes("math")) return { bg: "#F0E9FF", fg: "#5530B8" };
  return { bg: "#D3FAF3", fg: "#087B76" };
}

function StatBlock({
  value,
  label,
  divider,
}: {
  value: string | number;
  label: string;
  divider?: boolean;
}) {
  return (
    <View style={styles.statBlock}>
      {divider && <View style={styles.statDivider} />}
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  border,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  border?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.detailRow, border && styles.detailBorder, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={24} color={NAVY} style={styles.detailIcon} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
      <Ionicons name="chevron-forward" size={22} color={NAVY} />
    </Pressable>
  );
}

function SessionRow({
  booking,
  border,
}: {
  booking: BookingResponse;
  border?: boolean;
}) {
  const tint = statusTint(booking.status);
  const iconColors = subjectIconTint(booking.subject_name);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/learning/${booking.id}`)}
      style={({ pressed }) => [styles.sessionRow, border && styles.sessionBorder, pressed && styles.pressed]}
    >
      <View style={[styles.sessionIcon, { backgroundColor: iconColors.bg }]}>
        <Ionicons name={subjectIcon(booking.subject_name)} size={28} color={iconColors.fg} />
      </View>
      <View style={styles.sessionCopy}>
        <Text style={styles.sessionTitle} numberOfLines={1}>{booking.student_name ?? "Student"}</Text>
        <Text style={styles.sessionMeta} numberOfLines={1}>
          {booking.subject_name ?? "General"} · {compactDate(booking.scheduled_at)} · {formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: `${tint}1F` }]}>
        <View style={[styles.statusDot, { backgroundColor: tint }]} />
        <Text style={[styles.statusText, { color: tint }]}>{statusLabel(booking.status)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={NAVY} />
    </Pressable>
  );
}

function EditModal({
  title,
  initial,
  multiline = false,
  onSave,
  onClose,
}: {
  title: string;
  initial: string;
  multiline?: boolean;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave(value);
      onClose();
    } catch {
      Alert.alert("Could not save", "Please try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.modalShade}>
      <View style={styles.modalCard}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={NAVY} />
          </Pressable>
        </View>
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={multiline}
          placeholderTextColor={MUTED_NAVY}
          style={[styles.input, multiline && styles.inputMultiline]}
          textAlignVertical={multiline ? "top" : "center"}
        />
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, saving && styles.disabled]}
        >
          {saving ? <ActivityIndicator color={NAVY} /> : <Text style={styles.saveButtonText}>Save changes</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export default function TutorProfile() {
  const insets = useSafeAreaInsets();
  const { user, setUser, signOut } = useAuthStore();
  const [profile, setProfile] = useState<TutorDetail | null>(null);
  const [stats, setStats] = useState<TutorStats | null>(null);
  const [recentBookings, setRecentBookings] = useState<BookingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<"name" | "bio" | "qualifications" | null>(null);

  const load = useCallback(async () => {
    try {
      const profileData = await getMyTutorProfile();
      setProfile(profileData);

      const [statsData, bookingsData] = await Promise.all([
        getTutorStats().catch(() => null),
        listTutorBookings(profileData.id, { page: 1, page_size: 5 }).catch(() => null),
      ]);
      setStats(statsData);
      setRecentBookings(
        bookingsData
          ? [...bookingsData.items].sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at))
          : [],
      );
    } catch {
      setProfile(null);
      setStats(null);
      setRecentBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { refreshing, onRefresh } = useRefresh(load);

  const primarySubject = profile?.tutor_subjects[0]?.subject.name ?? profile?.subjects[0]?.name ?? "Expert";
  const fallbackName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Tutor";
  const displayName = profile?.display_name ?? fallbackName;
  const hourlyRate = profile ? `${formatCurrency(profile.rate_per_hour, profile.currency, 0)}/hr` : "—";
  const subjectList = useMemo(
    () => profile?.tutor_subjects.map(item => item.subject.name).join(", ") || "No subjects added yet",
    [profile?.tutor_subjects],
  );
  const location = [profile?.location_city, profile?.location_state].filter(Boolean).join(", ") || "Not set";
  const nextSlots = useMemo(
    () => (profile?.availability_slots ?? []).slice(0, 3),
    [profile?.availability_slots],
  );

  async function handleSave(payload: Parameters<typeof updateMyProfile>[0]) {
    const updated = await updateMyProfile(payload);
    setProfile(updated);
  }

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

    setUploading(true);
    try {
      const asset = result.assets[0];
      const updated = await uploadAvatar(asset.uri, asset.mimeType ?? "image/jpeg");
      setUser(updated);
      await load();
    } catch {
      Alert.alert("Upload failed", "Could not update your photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign out?", "You will need to sign in again to access your tutor account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/sign-in");
        },
      },
    ]);
  }

  function showSettings() {
    Alert.alert("Tutor settings", "Manage your tutor account options.", [
      { text: "Cancel", style: "cancel" },
      { text: "Open settings", onPress: () => router.push("/tutor-settings") },
      { text: "Sign out", style: "destructive", onPress: () => void handleSignOut() },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen} edges={["top"]}>
        <ActivityIndicator color={Colors.teal} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open tutor settings"
            onPress={showSettings}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
          >
            <Ionicons name="settings-outline" size={25} color={NAVY} />
          </Pressable>
        </View>
      </View>

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
        contentContainerStyle={[styles.content, { paddingBottom: TabBar.height + insets.bottom + 34 }]}
      >
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              onPress={handlePickImage}
              disabled={uploading}
              style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed, uploading && styles.disabled]}
            >
              {profile?.profile_image_url || user?.profile_image_url ? (
                <Image source={{ uri: profile?.profile_image_url ?? user?.profile_image_url ?? "" }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={45} color={NAVY} />
                </View>
              )}
              <View style={styles.cameraButton}>
                {uploading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="camera" size={17} color="#FFFFFF" />}
              </View>
            </Pressable>

            <View style={styles.identityCopy}>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.roleText} numberOfLines={1}>{primarySubject} Tutor · {teachingModeLabel(profile?.teaching_mode)}</Text>
              <View style={styles.verifiedRow}>
                <Ionicons
                  name={verificationIcon(profile?.verification_status)}
                  size={23}
                  color={profile?.verification_status === "verified" ? "#2D81F7" : Colors.gold}
                />
                <Text style={styles.verifiedText}>{verificationLabel(profile?.verification_status)}</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing("name")}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            >
              <Text style={styles.editButtonText}>Edit profile</Text>
            </Pressable>
          </View>

          <View style={styles.statsStrip}>
            <StatBlock value={stats?.total_sessions ?? 0} label="Sessions" />
            <StatBlock value={stats?.completed_sessions ?? 0} label="Completed" divider />
            <StatBlock value={profile?.average_rating ?? stats?.average_rating ?? "0.0"} label="Rating" divider />
            <StatBlock value={profile?.total_hours_taught ?? stats?.total_hours_taught ?? 0} label="Hours" divider />
          </View>
        </View>

        <View style={styles.tabs}>
          <Pressable accessibilityRole="button" style={styles.tabItem}>
            <Text style={styles.tabTextActive}>Overview</Text>
            <View style={styles.tabUnderline} />
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.tabItem}>
            <Text style={styles.tabText}>Activity</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>About & expertise</Text>
            <Pressable accessibilityRole="button" onPress={() => setEditing("bio")} hitSlop={8}>
              <Text style={styles.linkText}>Edit</Text>
            </Pressable>
          </View>
          <Text style={styles.aboutText}>
            {profile?.bio || `Experienced ${primarySubject.toLowerCase()} tutor helping pre-varsity students build confidence and improve every week.`}
          </Text>
          <View style={styles.cardDivider} />
          <DetailRow
            icon="ribbon-outline"
            label="Experience"
            value={`${profile?.years_of_experience ?? 0} years`}
            border
          />
          <DetailRow
            icon="school-outline"
            label="Credentials"
            value={profile?.qualifications || "Not added"}
            onPress={() => setEditing("qualifications")}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Teaching profile</Text>
          <DetailRow icon="book-outline" label="Subjects" value={subjectList} border />
          <DetailRow icon="cash-outline" label="Rate" value={hourlyRate} border />
          <DetailRow icon="videocam-outline" label="Mode" value={teachingModeLabel(profile?.teaching_mode)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact & privacy</Text>
          <View style={styles.privateRow}>
            <Ionicons name="lock-closed-outline" size={20} color={MUTED_NAVY} />
            <Text style={styles.privateText}>Only you and Didaskey can see this</Text>
          </View>
          <DetailRow icon="mail-outline" label="Email" value={user?.email ?? "—"} border />
          <DetailRow icon="location-outline" label="Location" value={location} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Availability</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/tutor-settings")} hitSlop={8}>
              <Text style={styles.linkText}>Edit</Text>
            </Pressable>
          </View>
          {nextSlots.length === 0 ? (
            <Text style={styles.emptyCopy}>No availability set yet.</Text>
          ) : (
            nextSlots.map((slot, index) => (
              <DetailRow
                key={slot.id}
                icon="time-outline"
                label={dayLabel(slot.day_of_week)}
                value={`${String(slot.start_time).slice(0, 5)} – ${String(slot.end_time).slice(0, 5)}`}
                border={index < nextSlots.length - 1}
              />
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent sessions</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(tutor)/sessions")} hitSlop={8}>
              <Text style={styles.linkText}>View all</Text>
            </Pressable>
          </View>
          {recentBookings.length === 0 ? (
            <View style={styles.emptySessions}>
              <Ionicons name="calendar-outline" size={30} color={MUTED_NAVY} />
              <Text style={styles.emptyTitle}>No sessions yet</Text>
            </View>
          ) : (
            recentBookings.slice(0, 3).map((booking, index, visible) => (
              <SessionRow key={booking.id} booking={booking} border={index < visible.length - 1} />
            ))
          )}
        </View>
      </ScrollView>

      {editing === "name" && profile && (
        <EditModal
          title="Display name"
          initial={profile.display_name}
          onSave={value => handleSave({ display_name: value })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === "bio" && profile && (
        <EditModal
          title="Bio"
          initial={profile.bio ?? ""}
          multiline
          onSave={value => handleSave({ bio: value })}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === "qualifications" && profile && (
        <EditModal
          title="Qualifications"
          initial={profile.qualifications ?? ""}
          multiline
          onSave={value => handleSave({ qualifications: value })}
          onClose={() => setEditing(null)}
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
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerInner: {
    width: "100%",
    maxWidth: 470,
    minHeight: 86,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  pageTitle: {
    fontFamily: "sans-bold",
    fontSize: 32,
    lineHeight: 38,
    color: NAVY,
  },
  circleButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.12)",
  },
  content: {
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  profileCard: {
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: NAVY,
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 3,
  },
  profileTop: {
    minHeight: 132,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  avatarWrap: {
    width: 76,
    height: 76,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.muted,
  },
  avatarFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.muted,
  },
  cameraButton: {
    position: "absolute",
    right: -4,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.teal,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: "sans-bold",
    fontSize: 22,
    lineHeight: 27,
    color: "#FFFFFF",
  },
  roleText: {
    marginTop: 5,
    fontFamily: "sans-medium",
    fontSize: 14,
    color: "#B7C9E4",
  },
  verifiedRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  verifiedText: {
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: "#BFF7EC",
  },
  editButton: {
    minHeight: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 17,
    backgroundColor: "#F4F8FC",
  },
  editButtonText: {
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: NAVY,
  },
  statsStrip: {
    minHeight: 75,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "rgba(23,68,114,0.42)",
  },
  statBlock: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statDivider: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 1,
    backgroundColor: "rgba(214,229,250,0.35)",
  },
  statValue: {
    fontFamily: "sans-bold",
    fontSize: 21,
    lineHeight: 25,
    color: "#FFFFFF",
  },
  statLabel: {
    marginTop: 5,
    fontFamily: "sans-medium",
    fontSize: 12,
    color: "#B7C9E4",
  },
  tabs: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 14,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabItem: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  tabTextActive: {
    fontFamily: "sans-bold",
    fontSize: 16,
    color: NAVY,
  },
  tabText: {
    fontFamily: "sans-bold",
    fontSize: 16,
    color: MUTED_NAVY,
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    width: 72,
    height: 5,
    borderRadius: 3,
    backgroundColor: LIME,
  },
  card: {
    borderRadius: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 15,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  cardTitle: {
    fontFamily: "sans-bold",
    fontSize: 20,
    lineHeight: 25,
    color: NAVY,
  },
  linkText: {
    fontFamily: "sans-semibold",
    fontSize: 15,
    color: "#0D63F3",
  },
  aboutText: {
    marginTop: 12,
    marginBottom: 14,
    fontFamily: "sans-medium",
    fontSize: 15,
    lineHeight: 22,
    color: MUTED_NAVY,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  detailRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailIcon: {
    width: 30,
  },
  detailLabel: {
    width: 84,
    fontFamily: "sans-medium",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontFamily: "sans-medium",
    fontSize: 14,
    color: NAVY,
  },
  privateRow: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  privateText: {
    fontFamily: "sans-medium",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  sessionRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sessionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sessionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitle: {
    fontFamily: "sans-bold",
    fontSize: 16,
    color: NAVY,
  },
  sessionMeta: {
    marginTop: 4,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  statusPill: {
    minHeight: 32,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontFamily: "sans-semibold",
    fontSize: 12,
  },
  emptyCopy: {
    marginTop: 12,
    marginBottom: 18,
    fontFamily: "sans-medium",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  emptySessions: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 10,
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: MUTED_NAVY,
  },
  modalShade: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 34,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: "sans-bold",
    fontSize: 18,
    color: NAVY,
  },
  input: {
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 14,
    backgroundColor: Colors.card,
    fontFamily: "sans-medium",
    fontSize: 14,
    color: NAVY,
  },
  inputMultiline: {
    minHeight: 130,
    paddingTop: 14,
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    backgroundColor: Colors.deepTeal,
  },
  saveButtonText: {
    fontFamily: "sans-bold",
    fontSize: 15,
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
});
