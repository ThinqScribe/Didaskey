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

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { signIn, loading, error, clearError } = useAuth();

  async function handleSignIn() {
    clearError();
    await signIn({ email: email.trim().toLowerCase(), password });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F5F0E8" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="auth-content">

            <AuthBrand
              title="Welcome back"
              subtitle="Sign in to continue your learning journey."
            />

            <View className="mt-8 gap-3">
              <AuthInput
                icon="mail-outline"
                placeholder="Email Address"
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

              {/* Error message */}
              {error && (
                <Text style={{ fontSize: 13, fontFamily: "sans-medium", color: "#dc2626", paddingHorizontal: 4 }}>
                  {error}
                </Text>
              )}

              <Pressable onPress={() => router.push("/(auth)/verify-email")} className="self-end">
                <Text className="auth-forgot">Forgot password?</Text>
              </Pressable>
            </View>

            <View className="mt-6">
              <AuthButton
                label="Sign In"
                loading={loading}
                disabled={!email || !password}
                onPress={handleSignIn}
              />
            </View>

            <View className="auth-divider-row mt-6">
              <View className="auth-divider-line" />
              <Text className="auth-divider-text">or continue with</Text>
              <View className="auth-divider-line" />
            </View>

            <View className="auth-social-row mt-4">
              <Pressable className="auth-social-button">
                <Image
                  source={{ uri: "https://www.google.com/favicon.ico" }}
                  style={{ width: 18, height: 18 }}
                  resizeMode="contain"
                />
                <Text className="auth-social-text">Google</Text>
              </Pressable>
              <Pressable className="auth-social-button">
                <Ionicons name="logo-apple" size={18} color="#272B2D" />
                <Text className="auth-social-text">Apple</Text>
              </Pressable>
            </View>

            <View className="auth-link-row mt-8">
              <Text className="auth-link-copy">Don't have an account?</Text>
              <Pressable onPress={() => router.push("/(auth)/sign-up")}>
                <Text className="auth-link"> Sign up</Text>
              </Pressable>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
