import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import AuthBrand from "@/components/AuthBrand";
import AuthInput from "@/components/AuthInput";
import AuthButton from "@/components/AuthButton";
import AuthShell from "@/components/AuthShell";
import { useAuth } from "@/lib/hooks/useAuth";
import { Colors } from "@/constants";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signIn, loading, error, clearError } = useAuth();

  async function handleSignIn() {
    clearError();
    await signIn({ email: email.trim().toLowerCase(), password });
  }

  return (
    <AuthShell>
      <AuthBrand
        title="Welcome back"
        subtitle="Sign in to continue your learning journey."
      />

      <View style={styles.form}>
        <AuthInput
          icon="mail-outline"
          placeholder="Email address"
          value={email}
          onChangeText={(v) => { clearError(); setEmail(v); }}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
        />
        <AuthInput
          icon="lock-closed-outline"
          placeholder="Password"
          value={password}
          onChangeText={(v) => { clearError(); setPassword(v); }}
          isPassword
          autoComplete="current-password"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={() => router.push("/(auth)/forgot-password")} style={styles.forgot}>
          <Text className="auth-forgot">Forgot password?</Text>
        </Pressable>
      </View>

      <View style={styles.submit}>
        <AuthButton
          label="Sign In"
          loading={loading}
          disabled={!email || !password}
          onPress={handleSignIn}
        />
      </View>

      <View className="auth-link-row" style={styles.linkRow}>
        <Text className="auth-link-copy">Don&apos;t have an account?</Text>
        <Pressable onPress={() => router.push("/(auth)/sign-up")}>
          <Text className="auth-link"> Sign up</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 30, gap: 12 },
  submit: { marginTop: 18 },
  forgot: { alignSelf: "flex-end", paddingTop: 2, paddingHorizontal: 4 },
  error: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFECEA",
    color: Colors.destructive,
    fontFamily: "sans-semibold",
    fontSize: 13,
  },
  linkRow: { marginTop: 30 },
});
