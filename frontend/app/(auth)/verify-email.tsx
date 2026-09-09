import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/lib/hooks/useAuth";
import { verifyEmail, extractErrorMessage } from "@/lib/api/auth";
import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";

const RESEND_COOLDOWN = 45;

export default function VerifyEmail() {
  const { email, token } = useLocalSearchParams<{ email?: string; token?: string }>();
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  async function confirmEmail() {
    setVerifying(true); setVerificationError("");
    try { await verifyEmail(token!); setVerified(true); }
    catch(e) { setVerificationError(extractErrorMessage(e, "This link may have expired. Request another verification email.")); }
    finally { setVerifying(false); }
  }
  const displayEmail = email ?? "your email";

  const { resendVerification, loading, error } = useAuth();

  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startCountdown();
    return () => clearInterval(intervalRef.current!);
  }, []);

  function startCountdown() {
    setCountdown(RESEND_COOLDOWN);
    setCanResend(false);
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleResend() {
    if (!canResend || loading) return;
    await resendVerification(displayEmail);
    startCountdown();
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const timerLabel = `${pad(Math.floor(countdown / 60))}:${pad(countdown % 60)}`;

  if (token) return <Page title="Verify your email"><Card><Text style={ui.text}>{verified ? "Your email is verified. You can now sign in." : "Confirm your email address to start learning on Didaskey."}</Text><ErrorNotice message={verificationError} /><Action label={verified ? "Sign in" : "Verify email"} busy={verifying} onPress={verified ? () => router.replace("/(auth)/sign-in") : confirmEmail} /></Card></Page>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F7F1E5" }}>

      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        style={{ paddingHorizontal: 24, paddingTop: 8, alignSelf: "flex-start" }}
      >
        <Ionicons name="arrow-back" size={22} color="#272B2D" />
      </Pressable>

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}>

        <Image
          source={require("@/assets/images/verify_image.png")}
          style={{ width: 200, height: 200 }}
          resizeMode="contain"
        />

        <View style={{ alignItems: "center", marginTop: 28, marginBottom: 28, gap: 6 }}>
          <Text style={{ fontSize: 26, fontFamily: "sans-bold", color: "#272B2D", textAlign: "center" }}>
            Verify your email
          </Text>
          <Text style={{ fontSize: 14, fontFamily: "sans-medium", color: "rgba(39,43,45,0.6)", textAlign: "center", lineHeight: 22 }}>
            We&apos;ve sent a verification link to
          </Text>
          <Text style={{ fontSize: 14, fontFamily: "sans-bold", color: "#0B3F43", textAlign: "center" }}>
            {displayEmail}
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "sans-medium", color: "rgba(39,43,45,0.55)", textAlign: "center", lineHeight: 20, marginTop: 4 }}>
            Please check your inbox and click the{"\n"}link to verify your account.
          </Text>
        </View>

        {/* Resend card */}
        <View style={{
          width: "100%",
          backgroundColor: "rgba(23,163,137,0.12)",
          borderRadius: 16,
          padding: 18,
          gap: 4,
          marginBottom: 24,
        }}>
          <Text style={{ fontSize: 14, fontFamily: "sans-semibold", color: "#272B2D" }}>
            Didn&apos;t receive the email?
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "sans-medium", color: "rgba(39,43,45,0.55)", lineHeight: 20 }}>
            Check your spam folder or resend the email.
          </Text>

          {/* API error */}
          {error && (
            <Text style={{ fontSize: 12, fontFamily: "sans-medium", color: "#dc2626", marginTop: 2 }}>
              {error}
            </Text>
          )}

          <Pressable onPress={handleResend} disabled={!canResend || loading} style={{ marginTop: 6 }}>
            <Text style={{
              fontSize: 14,
              fontFamily: "sans-bold",
              color: canResend && !loading ? "#17A389" : "rgba(23,163,137,0.45)",
            }}>
              {loading ? "Sending…" : canResend ? "Resend Email" : `Resend Email (${timerLabel})`}
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace("/(auth)/sign-up")}>
          <Text style={{ fontSize: 14, fontFamily: "sans-semibold", color: "#272B2D", textDecorationLine: "underline" }}>
            Change email address
          </Text>
        </Pressable>

      </View>
    </SafeAreaView>
  );
}
