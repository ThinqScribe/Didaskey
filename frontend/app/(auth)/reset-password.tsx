import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import AuthBrand from "@/components/AuthBrand";
import AuthButton from "@/components/AuthButton";
import AuthInput from "@/components/AuthInput";
import AuthShell from "@/components/AuthShell";
import { Colors } from "@/constants";
import { resetPassword, extractErrorMessage } from "@/lib/api/auth";

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await resetPassword(token!, password);
      setSaved(true);
    } catch (e) {
      setError(extractErrorMessage(e, "The reset link may have expired. Request a new one."));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell back>
        <AuthBrand title="Reset link needed" subtitle="Open the link from your password reset email." />
        <View style={styles.statePanel}>
          <View style={styles.iconBubble}>
            <Ionicons name="link-outline" size={32} color={Colors.deepTeal} />
          </View>
          <AuthButton label="Request Reset Link" onPress={() => router.replace("/(auth)/forgot-password")} />
        </View>
      </AuthShell>
    );
  }

  if (saved) {
    return (
      <AuthShell>
        <AuthBrand title="Password updated" subtitle="You can now sign in with your new password." />
        <View style={styles.statePanel}>
          <View style={styles.iconBubble}>
            <Ionicons name="checkmark-circle-outline" size={36} color={Colors.deepTeal} />
          </View>
          <AuthButton label="Sign In" onPress={() => router.replace("/(auth)/sign-in")} />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell back>
      <AuthBrand title="A fresh start" subtitle="Choose a new password for Didaskey." />

      <View style={styles.form}>
        <AuthInput
          icon="lock-closed-outline"
          placeholder="New password"
          value={password}
          onChangeText={(value) => { setError(""); setPassword(value); }}
          isPassword
          autoComplete="new-password"
          maxLength={72}
        />
        <AuthInput
          icon="shield-checkmark-outline"
          placeholder="Confirm password"
          value={confirm}
          onChangeText={(value) => { setError(""); setConfirm(value); }}
          isPassword
          autoComplete="new-password"
        />
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.submit}>
        <AuthButton label="Save Password" loading={busy} onPress={save} disabled={password.length < 8 || password !== confirm} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 30, gap: 12 },
  submit: { marginTop: 18 },
  error: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFECEA",
    color: Colors.destructive,
    fontFamily: "sans-semibold",
    fontSize: 13,
  },
  statePanel: { marginTop: 28, gap: 18, alignItems: "center" },
  iconBubble: { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center", backgroundColor: Colors.paleTeal },
});
