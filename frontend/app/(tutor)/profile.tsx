import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Spacing, TabBar } from "@/constants";
import { useAuthStore } from "@/lib/store/auth";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { formatCurrency } from "@/lib/api/bookings";
import { getMyTutorProfile, updateMyProfile, DAYS } from "@/lib/api/tutor-portal";
import type { TutorDetail, AvailabilitySlot } from "@/lib/api/tutors";

type Section = "main" | "personal" | "qualifications" | "subjects" | "availability";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  const [h, m] = String(t).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function SectionHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Pressable onPress={onBack} className="flex-row items-center gap-2 mb-5">
      <Ionicons name="chevron-back" size={20} color={Colors.charcoal} />
      <Text className="text-[17px] font-sans-bold text-charcoal">{label}</Text>
    </Pressable>
  );
}

function MenuRow({ icon, label, value, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 py-3.5 border-b border-border active:opacity-70"
    >
      <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
        <Ionicons name={icon} size={15} color={Colors.deepTeal} />
      </View>
      <Text className="flex-1 text-[14px] font-sans-medium text-charcoal">{label}</Text>
      {value ? (
        <Text className="text-[13px] font-sans-medium text-muted-foreground mr-1 max-w-[150px]"
          numberOfLines={1}>{value}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={Colors.mutedForeground} />
    </Pressable>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function EditModal({ title, initial, multiline = false, onSave, onClose }: {
  title: string;
  initial: string;
  multiline?: boolean;
  onSave: (v: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await onSave(value);
    setSaving(false);
    onClose();
  }

  return (
    <View className="absolute inset-0 justify-end"
      style={{ zIndex: 100, backgroundColor: "rgba(0,0,0,0.5)" }}>
      <View className="bg-background rounded-t-3xl px-6 pt-5 pb-10">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-[17px] font-sans-bold text-charcoal">{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={Colors.charcoal} />
          </Pressable>
        </View>
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={multiline}
          placeholderTextColor={Colors.mutedForeground}
          style={{
            borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
            padding: 14, fontFamily: "sans-medium", fontSize: 14,
            color: Colors.charcoal, minHeight: multiline ? 120 : 50,
            backgroundColor: Colors.card, textAlignVertical: multiline ? "top" : "center",
          }}
        />
        <Pressable
          onPress={submit}
          disabled={saving}
          className="mt-4 rounded-xl bg-deep-teal items-center py-4 active:opacity-80"
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          {saving
            ? <ActivityIndicator color={Colors.white} />
            : <Text className="text-[15px] font-sans-bold text-white">Save</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

function PersonalSection({ profile, onSave, onBack }: {
  profile: TutorDetail;
  onSave: (p: any) => Promise<void>;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState<"name" | "bio" | null>(null);

  return (
    <View>
      <SectionHeader label="Personal Information" onBack={onBack} />
      <View className="bg-white rounded-2xl px-4 mb-4"
        style={{ borderWidth: 1, borderColor: Colors.border }}>
        <MenuRow icon="person-outline" label="Display Name"
          value={profile.display_name} onPress={() => setEditing("name")} />
        <MenuRow icon="document-text-outline" label="Bio"
          value={profile.bio ?? "Not set"} onPress={() => setEditing("bio")} />
        <View className="flex-row items-center gap-3 py-3.5">
          <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
            <Ionicons name="briefcase-outline" size={15} color={Colors.deepTeal} />
          </View>
          <Text className="flex-1 text-[14px] font-sans-medium text-charcoal">Experience</Text>
          <Text className="text-[13px] font-sans-medium text-muted-foreground">
            {profile.years_of_experience} years
          </Text>
        </View>
        <View className="flex-row items-center gap-3 py-3.5">
          <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
            <Ionicons name="laptop-outline" size={15} color={Colors.deepTeal} />
          </View>
          <Text className="flex-1 text-[14px] font-sans-medium text-charcoal">Teaching Mode</Text>
          <Text className="text-[13px] font-sans-medium text-muted-foreground capitalize">
            {profile.teaching_mode === "both" ? "Online & In-Person" : profile.teaching_mode}
          </Text>
        </View>
      </View>

      {editing === "name" && (
        <EditModal title="Display Name" initial={profile.display_name}
          onSave={(v) => onSave({ display_name: v })} onClose={() => setEditing(null)} />
      )}
      {editing === "bio" && (
        <EditModal title="Bio" initial={profile.bio ?? ""} multiline
          onSave={(v) => onSave({ bio: v })} onClose={() => setEditing(null)} />
      )}
    </View>
  );
}

function QualificationsSection({ profile, onSave, onBack }: {
  profile: TutorDetail;
  onSave: (p: any) => Promise<void>;
  onBack: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <View>
      <SectionHeader label="Qualifications & Education" onBack={onBack} />
      <View className="bg-white rounded-2xl px-4 py-4 mb-4"
        style={{ borderWidth: 1, borderColor: Colors.border }}>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-[14px] font-sans-bold text-charcoal">Qualifications</Text>
          <Pressable onPress={() => setEditing(true)} hitSlop={8}>
            <Text className="text-[13px] font-sans-semibold text-teal">Edit</Text>
          </Pressable>
        </View>
        <Text className="text-[13px] font-sans-medium text-muted-foreground leading-5">
          {profile.qualifications ?? "No qualifications added yet."}
        </Text>
      </View>

      {editing && (
        <EditModal title="Qualifications" initial={profile.qualifications ?? ""} multiline
          onSave={(v) => onSave({ qualifications: v })} onClose={() => setEditing(false)} />
      )}
    </View>
  );
}

function SubjectsSection({ profile, onBack }: { profile: TutorDetail; onBack: () => void }) {
  return (
    <View>
      <SectionHeader label="Subjects & Expertise" onBack={onBack} />
      <View className="bg-white rounded-2xl px-4 py-4 mb-4"
        style={{ borderWidth: 1, borderColor: Colors.border }}>
        <Text className="text-[14px] font-sans-bold text-charcoal mb-3">Subjects I Teach</Text>
        {profile.tutor_subjects.length === 0 ? (
          <Text className="text-[13px] font-sans-medium text-muted-foreground">
            No subjects assigned. Contact support to update.
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {profile.tutor_subjects.map((ts) => (
              <View key={ts.subject_id}
                className="flex-row items-center rounded-full px-3 py-1.5"
                style={{ backgroundColor: `${Colors.teal}15`, borderWidth: 1, borderColor: `${Colors.teal}30` }}>
                <Text className="text-[12px] font-sans-semibold" style={{ color: Colors.teal }}>
                  {ts.subject.name}
                </Text>
                {ts.rate_override && (
                  <Text className="text-[11px] font-sans-medium ml-1" style={{ color: `${Colors.teal}80` }}>
                    · {formatCurrency(parseFloat(ts.rate_override), profile.currency, 0)}/hr
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
      <View className="bg-white rounded-2xl px-4 py-4"
        style={{ borderWidth: 1, borderColor: Colors.border }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-[14px] font-sans-bold text-charcoal">Hourly Rate</Text>
          <Text className="text-[17px] font-sans-bold text-deep-teal">
            {formatCurrency(parseFloat(profile.rate_per_hour), profile.currency, 0)}/hr
          </Text>
        </View>
      </View>
    </View>
  );
}

function AvailabilitySection({ slots, onBack }: {
  slots: AvailabilitySlot[];
  onBack: () => void;
}) {
  const slotMap = new Map(slots.map((s) => [s.day_of_week, s]));

  return (
    <View>
      <SectionHeader label="Availability" onBack={onBack} />
      <Text className="text-[13px] font-sans-medium text-muted-foreground mb-4">
        Your weekly schedule — contact support to make changes.
      </Text>
      <View className="bg-white rounded-2xl px-4"
        style={{ borderWidth: 1, borderColor: Colors.border }}>
        {DAYS.map((day, i) => {
          const slot = slotMap.get(day);
          return (
            <View key={day}
              className={`flex-row items-center py-3.5 ${i < DAYS.length - 1 ? "border-b border-border" : ""}`}>
              <Text className="flex-1 text-[14px] font-sans-semibold text-charcoal capitalize">
                {day}
              </Text>
              <Text className="text-[12px] font-sans-medium text-muted-foreground mr-3">
                {slot ? `${fmtTime(String(slot.start_time))} – ${fmtTime(String(slot.end_time))}` : "Unavailable"}
              </Text>
              <Switch
                value={!!slot}
                disabled
                trackColor={{ true: Colors.teal, false: Colors.muted }}
                thumbColor={Colors.white}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function TutorProfile() {
  const { user, signOut } = useAuthStore();
  const [profile, setProfile] = useState<TutorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("main");

  const load = useCallback(async () => {
    try {
      const p = await getMyTutorProfile();
      setProfile(p);
    } catch {
      // no profile yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  async function handleSave(payload: any) {
    const updated = await updateMyProfile(payload);
    setProfile(updated);
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => {
        await signOut();
        router.replace("/(auth)/sign-in");
      }},
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={["top"]}>
        <ActivityIndicator color={Colors.teal} />
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="flex-1" edges={["top"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={Colors.teal} colors={[Colors.teal]} />}
          contentContainerStyle={{
            paddingHorizontal: Spacing.xl,
            paddingTop: Spacing.base,
            paddingBottom: TabBar.height + TabBar.horizontalInset + Spacing.xl,
          }}
        >
          {/* ── Sub-sections ─────────────────────────────────────────────── */}
          {section === "personal" && profile && (
            <PersonalSection profile={profile} onSave={handleSave} onBack={() => setSection("main")} />
          )}
          {section === "qualifications" && profile && (
            <QualificationsSection profile={profile} onSave={handleSave} onBack={() => setSection("main")} />
          )}
          {section === "subjects" && profile && (
            <SubjectsSection profile={profile} onBack={() => setSection("main")} />
          )}
          {section === "availability" && profile && (
            <AvailabilitySection slots={profile.availability_slots} onBack={() => setSection("main")} />
          )}

          {/* ── Main menu ────────────────────────────────────────────────── */}
          {section === "main" && (
            <>
              {/* Identity */}
              <View className="flex-row items-center gap-4 mb-6">
                <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
                  <Ionicons name="person" size={28} color={Colors.deepTeal} />
                </View>
                <View className="flex-1">
                  <Text className="text-[18px] font-sans-bold text-charcoal">
                    {profile?.display_name ?? `${user?.first_name} ${user?.last_name}`}
                  </Text>
                  <Text className="text-[13px] font-sans-medium text-teal mt-0.5">
                    {profile?.tutor_subjects[0]?.subject.name
                      ? `${profile.tutor_subjects[0].subject.name} Tutor`
                      : "Tutor"}
                  </Text>
                  {profile?.verification_status === "verified" && (
                    <View className="flex-row items-center gap-1 mt-1">
                      <Ionicons name="shield-checkmark" size={13} color={Colors.teal} />
                      <Text className="text-[12px] font-sans-semibold text-teal">Verified Tutor</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Profile settings */}
              <Text className="text-[11px] font-sans-bold text-muted-foreground uppercase mb-2">
                Profile Settings
              </Text>
              <View className="bg-white rounded-2xl px-4 mb-4"
                style={{ borderWidth: 1, borderColor: Colors.border }}>
                <MenuRow icon="person-outline"    label="Personal Information"
                  onPress={() => setSection("personal")} />
                <MenuRow icon="ribbon-outline"    label="Qualifications & Education"
                  onPress={() => setSection("qualifications")} />
                <MenuRow icon="book-outline"      label="Subjects & Expertise"
                  onPress={() => setSection("subjects")} />
                <View className="flex-row items-center gap-3 py-3.5 border-b border-border">
                  <View className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                    <Ionicons name="time-outline" size={15} color={Colors.deepTeal} />
                  </View>
                  <Text className="flex-1 text-[14px] font-sans-medium text-charcoal">Availability</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.mutedForeground} />
                </View>
                <Pressable onPress={() => setSection("availability")}
                  className="absolute inset-x-4 bottom-0 h-14" />
              </View>

              {/* Account */}
              <Text className="text-[11px] font-sans-bold text-muted-foreground uppercase mb-2">
                Account
              </Text>
              <View className="bg-white rounded-2xl px-4 mb-6"
                style={{ borderWidth: 1, borderColor: Colors.border }}>
                <MenuRow icon="mail-outline"          label="Account Settings" />
                <MenuRow icon="notifications-outline" label="Notification Settings" />
                <MenuRow icon="lock-closed-outline"   label="Privacy & Security" />
              </View>

              {/* Sign out */}
              <Pressable
                onPress={handleSignOut}
                className="flex-row items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-white py-4 active:opacity-70"
              >
                <Ionicons name="log-out-outline" size={18} color={Colors.destructive} />
                <Text className="text-[15px] font-sans-semibold text-destructive">Sign Out</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
