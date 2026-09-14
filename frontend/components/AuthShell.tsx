import React, { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Colors } from "@/constants";

interface AuthShellProps {
  children: ReactNode;
  back?: boolean;
  topLink?: {
    label: string;
    action: string;
    href: string;
    replace?: boolean;
  };
}

const doodles: { icon: keyof typeof Ionicons.glyphMap; top: number; left?: number; right?: number; rotate: string; size: number }[] = [
  { icon: "book-outline", top: 56, left: 22, rotate: "-13deg", size: 54 },
  { icon: "school-outline", top: 126, right: 20, rotate: "12deg", size: 62 },
  { icon: "pencil-outline", top: 238, left: -4, rotate: "20deg", size: 66 },
  { icon: "calculator-outline", top: 346, right: -2, rotate: "-10deg", size: 58 },
  { icon: "chatbubble-ellipses-outline", top: 482, left: 30, rotate: "9deg", size: 58 },
  { icon: "sparkles-outline", top: 610, right: 28, rotate: "-18deg", size: 48 },
];

export default function AuthShell({ children, back = false, topLink }: AuthShellProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {doodles.map((item, index) => (
          <Ionicons
            key={`${item.icon}-${index}`}
            name={item.icon}
            size={item.size}
            color={index % 2 ? Colors.teal : Colors.deepTeal}
            style={[
              styles.doodle,
              {
                top: item.top,
                left: item.left,
                right: item.right,
                transform: [{ rotate: item.rotate }],
              },
            ]}
          />
        ))}
        <View style={styles.watermarkCircleTop} />
        <View style={styles.watermarkCircleBottom} />
      </View>

      {(back || topLink) && (
        <View style={styles.topBar}>
          {back ? (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
              <Ionicons name="chevron-back" size={23} color={Colors.deepTeal} />
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}
          {topLink && (
            <View style={styles.topLinkRow}>
              <Text style={styles.topLinkLabel}>{topLink.label}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => topLink.replace ? router.replace(topLink.href as any) : router.push(topLink.href as any)}
              >
                <Text style={styles.topLinkAction}>{topLink.action}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 28 },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: 24 },
  doodle: { position: "absolute", opacity: 0.055 },
  watermarkCircleTop: {
    position: "absolute",
    top: 38,
    right: -88,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.paleTeal,
    opacity: 0.28,
  },
  watermarkCircleBottom: {
    position: "absolute",
    bottom: -120,
    left: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: Colors.paleBlue,
    opacity: 0.34,
  },
  topBar: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(211,250,243,0.76)",
  },
  backSpacer: { width: 42, height: 42 },
  topLinkRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  topLinkLabel: { fontFamily: "sans-medium", fontSize: 13, color: Colors.mutedForeground },
  topLinkAction: { fontFamily: "sans-bold", fontSize: 13, color: Colors.deepTeal },
});
