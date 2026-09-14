import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import AuthBrand from "@/components/AuthBrand";
import AuthInput from "@/components/AuthInput";
import AuthButton from "@/components/AuthButton";
import AuthShell from "@/components/AuthShell";
import { useAuth } from "@/lib/hooks/useAuth";
import type { EducationLevel } from "@/lib/api/auth";
import { Colors } from "@/constants";

// ── Education levels config ───────────────────────────────────────────────────

const EDUCATION_LEVELS: {
  value: EducationLevel;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: "primary_school",   label: "Primary School",          icon: "book-outline" },
  { value: "junior_secondary", label: "Junior Secondary School", icon: "school-outline" },
  { value: "senior_secondary", label: "Senior Secondary School", icon: "school-outline" },
  { value: "high_school",      label: "High School",             icon: "business-outline" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons name="checkmark-circle" size={14} color={met ? Colors.teal : "rgba(7,29,58,0.24)"} />
      <Text style={{ fontSize: 12, fontFamily: "sans-medium", color: met ? Colors.deepTeal : Colors.mutedForeground }}>
        {label}
      </Text>
    </View>
  );
}

function EducationDropdown({
  value,
  onChange,
}: {
  value: EducationLevel | null;
  onChange: (v: EducationLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = EDUCATION_LEVELS.find((l) => l.value === value);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: Colors.muted,
          borderRadius: 999,
          paddingHorizontal: 20,
          height: 56,
        }}
      >
        <Ionicons name="school-outline" size={18} color={Colors.deepTeal} style={{ marginRight: 10, opacity: 0.72 }} />
        <View style={{ flex: 1 }}>
          {selected ? (
            <Text style={{ fontSize: 14, fontFamily: "sans-semibold", color: Colors.deepTeal }}>
              {selected.label}
            </Text>
          ) : (
            <Text style={{ fontSize: 14, fontFamily: "sans-medium", color: Colors.mutedForeground }}>
              Education Level
            </Text>
          )}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={Colors.deepTeal} />
      </Pressable>

      {open && (
        <View style={{
          marginTop: 8,
          backgroundColor: "#fff",
          borderRadius: 16,
          overflow: "hidden",
          maxHeight: 240,
          shadowColor: Colors.deepTeal,
          shadowOpacity: 0.08,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 4,
        }}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {EDUCATION_LEVELS.map((level) => (
              <Pressable
                key={level.value}
                onPress={() => { onChange(level.value); setOpen(false); }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  backgroundColor: value === level.value ? Colors.paleTeal : "#fff",
                }}
              >
                <Ionicons name={level.icon} size={18} color={value === level.value ? Colors.teal : Colors.deepTeal} />
                <Text style={{
                  fontSize: 14,
                  fontFamily: value === level.value ? "sans-semibold" : "sans-medium",
                  color: value === level.value ? Colors.deepTeal : Colors.foreground,
                }}>
                  {level.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SignUp() {
  const [role, setRole] = useState<"student" | "tutor">("student");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [educationLevel, setEducationLevel] = useState<EducationLevel | null>(null);
  const { signUp, loading, error, clearError } = useAuth();

  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const canSubmit =
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!email.trim() &&
    !!phone.trim() &&
    rules.length &&
    rules.upper &&
    rules.number &&
    (role === "tutor" || educationLevel !== null);

  async function handleSignUp() {
    clearError();
    await signUp({
      email: email.trim().toLowerCase(),
      phone_number: phone.trim(),
      password,
      role,
      education_level: role === "student" ? educationLevel : null,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });
  }

  return (
    <AuthShell
      back
      topLink={{ label: "Already have an account?", action: "Sign in", href: "/(auth)/sign-in", replace: true }}
    >
      <AuthBrand title="Create your account" subtitle="Start your learning journey with Didaskey." />

      <View style={styles.rolePicker}>
        {(["student", "tutor"] as const).map(item => {
          const active = role === item;
          return (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => setRole(item)}
              style={[styles.roleButton, active && styles.roleButtonActive]}
            >
              <Ionicons name={item === "student" ? "school-outline" : "briefcase-outline"} size={17} color={active ? "#FFFFFF" : Colors.deepTeal} />
              <Text style={[styles.roleText, active && styles.roleTextActive]}>{item === "student" ? "Student" : "Tutor"}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.form}>
        <View style={styles.nameRow}>
          <View style={{ flex: 1 }}>
            <AuthInput icon="person-outline" placeholder="First Name" value={firstName}
              onChangeText={(v) => { clearError(); setFirstName(v); }} autoComplete="given-name" textContentType="givenName" />
          </View>
          <View style={{ flex: 1 }}>
            <AuthInput placeholder="Last Name" value={lastName}
              onChangeText={(v) => { clearError(); setLastName(v); }} autoComplete="family-name" textContentType="familyName" />
          </View>
        </View>
        <AuthInput icon="mail-outline" placeholder="Email address" value={email}
          onChangeText={(v) => { clearError(); setEmail(v); }} keyboardType="email-address" autoComplete="email" autoCapitalize="none" />
        <AuthInput icon="call-outline" placeholder="+1234567890" value={phone}
          onChangeText={(v) => { clearError(); setPhone(v); }} keyboardType="phone-pad" autoComplete="tel" />
        <AuthInput icon="lock-closed-outline" placeholder="Password" value={password}
          onChangeText={(v) => { clearError(); setPassword(v); }} isPassword autoComplete="new-password" />

        {role === "student" && <EducationDropdown value={educationLevel} onChange={setEducationLevel} />}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.rules}>
          <PasswordRule met={rules.length} label="At least 8 characters" />
          <PasswordRule met={rules.upper} label="One uppercase letter" />
          <PasswordRule met={rules.number} label="One number" />
        </View>
      </View>

      <View style={styles.submit}>
        <AuthButton label="Create Account" loading={loading} disabled={!canSubmit} onPress={handleSignUp} />
      </View>

      <Text style={styles.footerCopy}>Personal learning for primary and secondary school students.</Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  rolePicker: { flexDirection: "row", gap: 10, marginTop: 24 },
  roleButton: { flex: 1, height: 50, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.muted },
  roleButtonActive: { backgroundColor: Colors.deepTeal },
  roleText: { fontFamily: "sans-bold", fontSize: 13, color: Colors.deepTeal },
  roleTextActive: { color: "#FFFFFF" },
  form: { marginTop: 18, gap: 11 },
  nameRow: { flexDirection: "row", gap: 10 },
  rules: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 4, paddingTop: 2 },
  submit: { marginTop: 20 },
  error: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFECEA",
    color: Colors.destructive,
    fontFamily: "sans-semibold",
    fontSize: 13,
  },
  footerCopy: { textAlign: "center", color: Colors.mutedForeground, fontFamily: "sans-medium", fontSize: 13, lineHeight: 20, marginTop: 20 },
});
