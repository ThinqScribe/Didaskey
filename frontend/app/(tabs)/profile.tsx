import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
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
import { LoadingState, Rise, ScreenFade } from "@/components/ui/Motion";
import { useAuthStore } from "@/lib/store/auth";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { updateMe, uploadAvatar, type EducationLevel } from "@/lib/api/auth";
import {
  formatBookingTimeRange,
  listBookings,
  type BookingResponse,
  type BookingStatus,
} from "@/lib/api/bookings";

const NAVY = "#071D3A";
const MUTED_NAVY = "#66718E";
const LIME = "#BFFF4B";
const CARD_BORDER = Colors.border;

const EDUCATION_LABELS: Record<string, string> = {
  primary_school: "Primary School",
  junior_secondary: "Junior Secondary",
  senior_secondary: "Senior Secondary",
  high_school: "High School",
  undergraduate: "Undergraduate",
  postgraduate: "Postgraduate",
};

const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
  { value: "primary_school", label: "Primary School" },
  { value: "junior_secondary", label: "Junior Secondary" },
  { value: "senior_secondary", label: "Senior Secondary" },
  { value: "high_school", label: "High School" },
  { value: "undergraduate", label: "Undergraduate" },
  { value: "postgraduate", label: "Postgraduate" },
];

function fullEducationLabel(educationLevel?: string | null) {
  if (!educationLevel) return "Senior Secondary";
  return EDUCATION_LABELS[educationLevel] ?? "Senior Secondary";
}

function shortEducationLabel(educationLevel?: string | null) {
  return fullEducationLabel(educationLevel).split(" ")[0] ?? "Senior";
}

function compactDate(isoString: string) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  return "book-outline";
}

function subjectIconTint(subject?: string | null) {
  const normalized = subject?.toLowerCase() ?? "";
  if (normalized.includes("phys")) return { bg: "#EAF0FF", fg: "#0C35B8" };
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  border?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" style={({ pressed }) => [styles.detailRow, border && styles.detailBorder, pressed && styles.pressed]}>
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
        <Text style={styles.sessionTitle} numberOfLines={1}>{booking.subject_name ?? "General"}</Text>
        <Text style={styles.sessionMeta} numberOfLines={1}>
          {compactDate(booking.scheduled_at)} · {formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}
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

export default function StudentProfile() {
  const insets = useSafeAreaInsets();
  const { user, setUser, signOut } = useAuthStore();
  const [recentBookings, setRecentBookings] = useState<BookingResponse[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEducation, setEditEducation] = useState<EducationLevel>("senior_secondary");

  const load = useCallback(async () => {
    try {
      const [allBookings, completedBookings] = await Promise.all([
        listBookings({ page: 1, page_size: 8 }),
        listBookings({ status: "completed", page: 1, page_size: 1 }),
      ]);
      setRecentBookings([...allBookings.items].sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)));
      setTotalSessions(allBookings.total);
      setCompletedSessions(completedBookings.total);
    } catch {
      setRecentBookings([]);
      setTotalSessions(0);
      setCompletedSessions(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { refreshing, onRefresh } = useRefresh(load);

  const displayName = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "Mary Tubokeyi";
  const education = fullEducationLabel(user?.education_level);
  const level = shortEducationLabel(user?.education_level);
  const aboutText = `${education} student, passionate about learning and growing every day.`;

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
      const updated = await uploadAvatar(asset.uri, asset.mimeType ?? "image/jpeg", (asset as { file?: File }).file);
      setUser(updated);
    } catch {
      Alert.alert("Upload failed", "Could not update your photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign out?", "You will need to sign in again to access your lessons.", [
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

  function showEditProfile() {
    setEditFirstName(user?.first_name ?? "");
    setEditLastName(user?.last_name ?? "");
    setEditPhone(user?.phone_number ?? "");
    setEditEducation((user?.education_level as EducationLevel | null) ?? "senior_secondary");
    setEditOpen(true);
  }

  async function saveProfile() {
    const first = editFirstName.trim();
    const last = editLastName.trim();
    const phone = editPhone.trim();
    if (!first || !last) {
      Alert.alert("Name required", "Enter your first and last name.");
      return;
    }
    if (phone && (!phone.startsWith("+") || !/^\+\d{8,15}$/.test(phone))) {
      Alert.alert("Phone number", "Use international format, for example +2348012345678.");
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await updateMe({
        first_name: first,
        last_name: last,
        phone_number: phone || null,
        education_level: editEducation,
      });
      setUser(updated);
      setEditOpen(false);
    } catch (err) {
      Alert.alert("Could not save profile", err instanceof Error ? err.message : "Please try again in a moment.");
    } finally {
      setSavingProfile(false);
    }
  }

  function showSettings() {
    Alert.alert("Profile settings", "Manage your account options.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void handleSignOut() },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen} edges={["top"]}>
        <View style={styles.loadingShell}>
          <LoadingState />
        </View>
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
            accessibilityLabel="Open profile settings"
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
        <Rise>
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              onPress={handlePickImage}
              disabled={uploading}
              style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed, uploading && styles.disabled]}
            >
              {user?.profile_image_url ? (
                <Image source={{ uri: user.profile_image_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={45} color={NAVY} />
                </View>
              )}
              <View style={styles.cameraButton}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="camera" size={17} color="#FFFFFF" />
                )}
              </View>
            </Pressable>

            <View style={styles.identityCopy}>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.roleText} numberOfLines={1}>Student · {education}</Text>
              <View style={styles.verifiedRow}>
                <Ionicons
                  name={user?.is_verified ? "checkmark-circle" : "time-outline"}
                  size={23}
                  color={user?.is_verified ? "#2D81F7" : Colors.gold}
                />
                <Text style={styles.verifiedText}>{user?.is_verified ? "Verified" : "Verification pending"}</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={showEditProfile}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            >
              <Text style={styles.editButtonText}>Edit profile</Text>
            </Pressable>
          </View>

          <View style={styles.statsStrip}>
            <StatBlock value={totalSessions} label="Sessions" />
            <StatBlock value={completedSessions} label="Completed" divider />
            <StatBlock value="4.8" label="Rating" divider />
            <StatBlock value={level} label="Level" divider />
          </View>
        </View>
        </Rise>

        <ScreenFade>
        <View style={styles.tabs}>
          <Pressable accessibilityRole="button" style={styles.tabItem}>
            <Text style={styles.tabTextActive}>Overview</Text>
            <View style={styles.tabUnderline} />
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.tabItem}>
            <Text style={styles.tabText}>Activity</Text>
          </Pressable>
        </View>
        </ScreenFade>

        <Rise delay={90}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>About & education</Text>
            <Pressable accessibilityRole="button" onPress={showEditProfile} hitSlop={8}>
              <Text style={styles.linkText}>Edit</Text>
            </Pressable>
          </View>
          <Text style={styles.aboutText}>{aboutText}</Text>
          <View style={styles.cardDivider} />
          <DetailRow icon="school-outline" label="Education" value={education} />
        </View>
        </Rise>

        <Rise delay={140}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact & privacy</Text>
          <View style={styles.privateRow}>
            <Ionicons name="lock-closed-outline" size={20} color={MUTED_NAVY} />
            <Text style={styles.privateText}>Only you can see this</Text>
          </View>
          <DetailRow icon="mail-outline" label="Email" value={user?.email ?? "—"} border />
          <DetailRow icon="call-outline" label="Phone" value={user?.phone_number ?? "—"} border />
          <Pressable accessibilityRole="button" onPress={showEditProfile} style={({ pressed }) => [styles.manageRow, pressed && styles.pressed]}>
            <Text style={styles.manageText}>Manage personal information</Text>
            <Ionicons name="chevron-forward" size={22} color={NAVY} />
          </Pressable>
        </View>
        </Rise>

        <Rise delay={190}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent sessions</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/bookings")} hitSlop={8}>
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
        </Rise>
      </ScrollView>
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.editorSheet}>
            <View style={styles.editorHeader}>
              <View>
                <Text style={styles.editorTitle}>Edit profile</Text>
                <Text style={styles.editorSubtitle}>Keep your learning profile accurate.</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setEditOpen(false)} style={styles.editorClose}>
                <Ionicons name="close" size={20} color={NAVY} />
              </Pressable>
            </View>
            <View style={styles.editorGrid}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>First name</Text>
                <TextInput value={editFirstName} onChangeText={setEditFirstName} style={[styles.editorInput, Platform.OS === "web" && ({ outlineStyle: "none" } as any)]} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Last name</Text>
                <TextInput value={editLastName} onChangeText={setEditLastName} style={[styles.editorInput, Platform.OS === "web" && ({ outlineStyle: "none" } as any)]} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone</Text>
                <TextInput value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" placeholder="+2348012345678" placeholderTextColor={MUTED_NAVY} style={[styles.editorInput, Platform.OS === "web" && ({ outlineStyle: "none" } as any)]} />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Education level</Text>
                <View style={styles.educationWrap}>
                  {EDUCATION_OPTIONS.map(option => {
                    const active = editEducation === option.value;
                    return (
                      <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setEditEducation(option.value)} style={[styles.educationPill, active && styles.educationPillActive]}>
                        <Text style={[styles.educationPillText, active && styles.educationPillTextActive]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={saveProfile} disabled={savingProfile} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, savingProfile && styles.disabled]}>
              {savingProfile ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
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
  loadingShell: {
    width: "100%",
    maxWidth: 470,
    paddingHorizontal: 18,
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
  manageRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  manageText: {
    fontFamily: "sans-medium",
    fontSize: 15,
    color: "#0D63F3",
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
    borderRadius: 8,
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
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.72,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    backgroundColor: "rgba(7,29,58,0.38)",
  },
  editorSheet: {
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    paddingBottom: 24,
    gap: 16,
    backgroundColor: Colors.card,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  editorTitle: {
    fontFamily: "sans-bold",
    fontSize: 22,
    color: NAVY,
  },
  editorSubtitle: {
    marginTop: 4,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  editorClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F3F8",
  },
  editorGrid: {
    gap: 12,
  },
  inputGroup: {
    gap: 7,
  },
  inputLabel: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: MUTED_NAVY,
  },
  editorInput: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 15,
    fontFamily: "sans-semibold",
    fontSize: 14,
    color: NAVY,
    backgroundColor: "#F6F8FB",
  },
  educationWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  educationPill: {
    minHeight: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#F0F3F8",
  },
  educationPillActive: {
    backgroundColor: NAVY,
  },
  educationPillText: {
    fontFamily: "sans-semibold",
    fontSize: 12,
    color: MUTED_NAVY,
  },
  educationPillTextActive: {
    color: "#FFFFFF",
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NAVY,
  },
  saveButtonText: {
    fontFamily: "sans-bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
});
