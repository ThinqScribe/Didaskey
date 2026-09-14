import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import AuthBrand from "@/components/AuthBrand";
import AuthButton from "@/components/AuthButton";
import AuthInput from "@/components/AuthInput";
import AuthShell from "@/components/AuthShell";
import { Colors } from "@/constants";
import { forgotPassword, extractErrorMessage } from "@/lib/api/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError("");
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (e) {
      setError(extractErrorMessage(e, "Could not send reset instructions."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell back>
      <AuthBrand title={sent ? "Check your inbox" : "Forgot password?"} subtitle={sent ? "Your reset link is on the way." : "We will help you get back to learning."} />

      {sent ? (
        <View style={styles.statePanel}>
          <View style={styles.iconBubble}>
            <Ionicons name="mail-unread-outline" size={32} color={Colors.deepTeal} />
          </View>
          <Text style={styles.panelTitle}>Reset instructions sent</Text>
          <Text style={styles.panelText}>If an account exists for this address, password reset instructions are on their way. Check your inbox and spam folder.</Text>
          <AuthButton label="Back to Sign In" onPress={() => router.replace("/(auth)/sign-in")} />
        </View>
      ) : (
        <>
          <View style={styles.form}>
            <AuthInput
              icon="mail-outline"
              placeholder="Email address"
              value={email}
              onChangeText={(value) => { setError(""); setEmail(value); }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
          <View style={styles.submit}>
            <AuthButton label="Send Reset Link" onPress={send} loading={busy} disabled={!email.trim()} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(auth)/sign-in")} style={styles.secondaryLink}>
            <Text style={styles.secondaryLinkText}>Return to sign in</Text>
          </Pressable>
        </>
      )}
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
  statePanel: { marginTop: 28, gap: 16, alignItems: "center" },
  iconBubble: { width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center", backgroundColor: Colors.paleTeal },
  panelTitle: { fontFamily: "sans-bold", fontSize: 20, color: Colors.deepTeal, textAlign: "center" },
  panelText: { fontFamily: "sans-medium", fontSize: 14, lineHeight: 22, color: Colors.mutedForeground, textAlign: "center" },
  secondaryLink: { marginTop: 22, alignSelf: "center", minHeight: 42, justifyContent: "center" },
  secondaryLinkText: { fontFamily: "sans-bold", fontSize: 14, color: Colors.deepTeal },
});
