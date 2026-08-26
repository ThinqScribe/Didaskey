import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import AuthBrand from "@/components/AuthBrand";
import AuthInput from "@/components/AuthInput";
import AuthButton from "@/components/AuthButton";
import { useAuth } from "@/lib/hooks/useAuth";
import type { EducationLevel } from "@/lib/api/auth";

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
  { value: "undergraduate",    label: "Undergraduate",           icon: "school-outline" },
  { value: "postgraduate",     label: "Postgraduate",            icon: "ribbon-outline" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Ionicons name="checkmark-circle" size={14} color={met ? "#17A389" : "rgba(39,43,45,0.25)"} />
      <Text style={{ fontSize: 12, fontFamily: "sans-medium", color: met ? "#17A389" : "rgba(39,43,45,0.45)" }}>
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
          backgroundColor: "#fff",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(11,63,67,0.18)",
          paddingHorizontal: 20,
          height: 52,
        }}
      >
        <Ionicons name="school-outline" size={18} color="rgba(39,43,45,0.4)" style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          {selected ? (
            <Text style={{ fontSize: 14, fontFamily: "sans-semibold", color: "#0B3F43" }}>
              {selected.label}
            </Text>
          ) : (
            <Text style={{ fontSize: 14, fontFamily: "sans-medium", color: "rgba(39,43,45,0.35)" }}>
              Education Level
            </Text>
          )}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color="rgba(39,43,45,0.5)" />
      </Pressable>

      {open && (
        <View style={{
          marginTop: 4,
          backgroundColor: "#fff",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(11,63,67,0.12)",
          overflow: "hidden",
          maxHeight: 240,
        }}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {EDUCATION_LEVELS.map((level, i) => (
              <Pressable
                key={level.value}
                onPress={() => { onChange(level.value); setOpen(false); }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: "rgba(11,63,67,0.08)",
                  backgroundColor: value === level.value ? "rgba(23,163,137,0.06)" : "#fff",
                }}
              >
                <Ionicons name={level.icon} size={18} color={value === level.value ? "#17A389" : "#0B3F43"} />
                <Text style={{
                  fontSize: 14,
                  fontFamily: value === level.value ? "sans-semibold" : "sans-medium",
                  color: value === level.value ? "#17A389" : "#272B2D",
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
    educationLevel !== null;

  async function handleSignUp() {
    clearError();
    await signUp({
      email: email.trim().toLowerCase(),
      phone_number: phone.trim(),
      password,
      role: "student",
      education_level: educationLevel,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F0E8" }}>
      {/* Top bar */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 4,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#272B2D" />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontSize: 13, fontFamily: "sans-medium", color: "rgba(39,43,45,0.6)" }}>
            Already have an account?
          </Text>
          <Pressable onPress={() => router.replace("/(auth)/sign-in")}>
            <Text style={{ fontSize: 13, fontFamily: "sans-bold", color: "#17A389" }}>Sign in</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="auth-content">

            <AuthBrand title="Create your account" subtitle="Start your learning journey with Didaskey." />

            <View style={{ marginTop: 24, gap: 10 }}>
              {/* First name + Last name side by side */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <AuthInput icon="person-outline" placeholder="First Name" value={firstName}
                    onChangeText={(v) => { clearError(); setFirstName(v); }} autoComplete="given-name" textContentType="givenName" />
                </View>
                <View style={{ flex: 1 }}>
                  <AuthInput placeholder="Last Name" value={lastName}
                    onChangeText={(v) => { clearError(); setLastName(v); }} autoComplete="family-name" textContentType="familyName" />
                </View>
              </View>
              <AuthInput icon="mail-outline" placeholder="Email Address" value={email}
                onChangeText={(v) => { clearError(); setEmail(v); }} keyboardType="email-address" autoComplete="email" autoCapitalize="none" />
              <AuthInput icon="call-outline" placeholder="+1234567890 (include country code)" value={phone}
                onChangeText={(v) => { clearError(); setPhone(v); }} keyboardType="phone-pad" autoComplete="tel" />
              <AuthInput icon="lock-closed-outline" placeholder="Password" value={password}
                onChangeText={(v) => { clearError(); setPassword(v); }} isPassword autoComplete="new-password" />

              <EducationDropdown value={educationLevel} onChange={setEducationLevel} />

              {/* Error message */}
              {error && (
                <Text style={{ fontSize: 13, fontFamily: "sans-medium", color: "#dc2626", paddingHorizontal: 4 }}>
                  {error}
                </Text>
              )}

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 4, paddingTop: 2 }}>
                <PasswordRule met={rules.length} label="At least 8 characters" />
                <PasswordRule met={rules.upper} label="One uppercase letter" />
                <PasswordRule met={rules.number} label="One number" />
              </View>
            </View>

            <View style={{ marginTop: 20 }}>
              <AuthButton label="Create Account →" loading={loading} disabled={!canSubmit} onPress={handleSignUp} />
            </View>

            <View className="auth-divider-row" style={{ marginTop: 20 }}>
              <View className="auth-divider-line" />
              <Text className="auth-divider-text">or continue with</Text>
              <View className="auth-divider-line" />
            </View>

            <View className="auth-social-row" style={{ marginTop: 12 }}>
              <Pressable className="auth-social-button">
                <Image source={{ uri: "https://www.google.com/favicon.ico" }} style={{ width: 18, height: 18 }} resizeMode="contain" />
                <Text className="auth-social-text">Continue with Google</Text>
              </Pressable>
              <Pressable className="auth-social-button">
                <Ionicons name="logo-apple" size={18} color="#272B2D" />
                <Text className="auth-social-text">Continue with Apple</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 20, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 3 }}>
              <Text style={{ fontSize: 12, fontFamily: "sans-medium", color: "rgba(39,43,45,0.55)" }}>
                By creating an account, you agree to our
              </Text>
              <Pressable><Text style={{ fontSize: 12, fontFamily: "sans-bold", color: "#17A389" }}>Terms of Use</Text></Pressable>
              <Text style={{ fontSize: 12, fontFamily: "sans-medium", color: "rgba(39,43,45,0.55)" }}>and</Text>
              <Pressable><Text style={{ fontSize: 12, fontFamily: "sans-bold", color: "#17A389" }}>Privacy Policy</Text></Pressable>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
