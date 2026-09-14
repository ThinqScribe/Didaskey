import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import AuthBrand from "@/components/AuthBrand";
import AuthButton from "@/components/AuthButton";
import AuthShell from "@/components/AuthShell";
import { Colors } from "@/constants";
import { useAuth } from "@/lib/hooks/useAuth";
import { verifyEmail, extractErrorMessage } from "@/lib/api/auth";

const RESEND_COOLDOWN = 45;

export default function VerifyEmail() {
  const { email, token } = useLocalSearchParams<{ email?: string; token?: string }>();
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const { resendVerification, loading, error } = useAuth();
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const displayEmail = email ?? "your email";

  useEffect(() => {
    startCountdown();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startCountdown() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCountdown(RESEND_COOLDOWN);
    setCanResend(false);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function confirmEmail() {
    setVerifying(true);
    setVerificationError("");
    try {
      await verifyEmail(token!);
      setVerified(true);
    } catch (e) {
      setVerificationError(extractErrorMessage(e, "This link may have expired. Request another verification email."));
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!canResend || loading) return;
    await resendVerification(displayEmail);
    startCountdown();
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const timerLabel = `${pad(Math.floor(countdown / 60))}:${pad(countdown % 60)}`;

  if (token) {
    return (
      <AuthShell>
        <AuthBrand
          title={verified ? "Email verified" : "Verify your email"}
          subtitle={verified ? "Your account is ready." : "Confirm your email address to start learning."}
        />
        <View style={styles.statePanel}>
          <View style={styles.iconBubble}>
            <Ionicons name={verified ? "checkmark-circle-outline" : "mail-outline"} size={36} color={Colors.deepTeal} />
          </View>
          {verificationError && <Text style={styles.error}>{verificationError}</Text>}
          <AuthButton
            label={verified ? "Sign In" : "Verify Email"}
            loading={verifying}
            onPress={verified ? () => router.replace("/(auth)/sign-in") : confirmEmail}
          />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell back>
      <AuthBrand title="Verify your email" subtitle="We sent a verification link to your inbox." />

      <View style={styles.emailPanel}>
        <View style={styles.iconBubble}>
          <Ionicons name="mail-unread-outline" size={34} color={Colors.deepTeal} />
        </View>
        <Text style={styles.emailText}>Verification link sent to</Text>
        <Text style={styles.emailValue} numberOfLines={1}>{displayEmail}</Text>
        <Text style={styles.helpText}>Please check your inbox and spam folder, then open the link to activate your account.</Text>
      </View>

      <View style={styles.resendPanel}>
        <View style={{ flex: 1 }}>
          <Text style={styles.resendTitle}>Didn&apos;t receive it?</Text>
          <Text style={styles.resendText}>You can request a fresh link after the timer ends.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={handleResend} disabled={!canResend || loading} style={[styles.resendButton, (!canResend || loading) && styles.disabled]}>
          <Text style={styles.resendButtonText}>{loading ? "Sending" : canResend ? "Resend" : timerLabel}</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable accessibilityRole="button" onPress={() => router.replace("/(auth)/sign-up")} style={styles.secondaryLink}>
        <Text style={styles.secondaryLinkText}>Change email address</Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  statePanel: { marginTop: 28, gap: 18, alignItems: "center" },
  iconBubble: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", backgroundColor: Colors.paleTeal },
  emailPanel: { marginTop: 28, alignItems: "center", gap: 8 },
  emailText: { fontFamily: "sans-medium", fontSize: 14, color: Colors.mutedForeground, textAlign: "center" },
  emailValue: { maxWidth: "100%", fontFamily: "sans-bold", fontSize: 16, color: Colors.deepTeal, textAlign: "center" },
  helpText: { marginTop: 6, fontFamily: "sans-medium", fontSize: 14, lineHeight: 22, color: Colors.mutedForeground, textAlign: "center" },
  resendPanel: { marginTop: 26, minHeight: 86, borderRadius: 28, paddingHorizontal: 18, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.paleTeal },
  resendTitle: { fontFamily: "sans-bold", fontSize: 15, color: Colors.deepTeal },
  resendText: { marginTop: 3, fontFamily: "sans-medium", fontSize: 12, lineHeight: 18, color: Colors.mutedForeground },
  resendButton: { minWidth: 88, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: Colors.deepTeal },
  resendButtonText: { fontFamily: "sans-bold", fontSize: 13, color: "#FFFFFF" },
  disabled: { opacity: 0.48 },
  error: {
    width: "100%",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFECEA",
    color: Colors.destructive,
    fontFamily: "sans-semibold",
    fontSize: 13,
    textAlign: "center",
  },
  secondaryLink: { marginTop: 24, alignSelf: "center", minHeight: 42, justifyContent: "center" },
  secondaryLinkText: { fontFamily: "sans-bold", fontSize: 14, color: Colors.deepTeal, textDecorationLine: "underline" },
});
