import { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";

export const ui = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, gap: 18, paddingBottom: 120, width: "100%", maxWidth: 760, alignSelf: "center" },
  title: { fontFamily: "sans-bold", fontSize: 30, letterSpacing: 0, color: Colors.foreground },
  heading: { fontFamily: "sans-bold", fontSize: 18, color: Colors.foreground },
  text: { fontFamily: "sans-regular", fontSize: 15, lineHeight: 23, color: Colors.foreground },
  muted: { fontFamily: "sans-medium", fontSize: 13, lineHeight: 20, color: Colors.mutedForeground },
  row: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  card: { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, padding: 18, gap: 12, shadowColor: Colors.deepTeal, shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  field: { backgroundColor: Colors.card, color: Colors.foreground, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 14, minHeight: 48, fontSize: 15, fontFamily: "sans-regular" },
});

export function Page({ title, subtitle, children, back = true }: { title: string; subtitle?: string; children: ReactNode; back?: boolean }) {
  return <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top", "bottom"]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
      {back && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={{ minHeight: 44, justifyContent: "center" }}><Ionicons name="arrow-back" size={24} color={Colors.primary} /></Pressable>}
      <View style={{ gap: 6 }}><Text style={ui.title}>{title}</Text>{subtitle && <Text style={ui.muted}>{subtitle}</Text>}</View>
      {children}
    </ScrollView>
  </SafeAreaView>;
}
export function Card({ children }: { children: ReactNode }) { return <View style={ui.card}>{children}</View>; }
export function Action({ label, onPress, busy = false, secondary = false, disabled = false }: { label: string; onPress: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => ({ minHeight: 48, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 13, alignItems: "center", justifyContent: "center", borderWidth: secondary ? 1 : 0, borderColor: secondary ? Colors.border : "transparent", backgroundColor: secondary ? Colors.card : Colors.primary, opacity: disabled || busy ? 0.55 : pressed ? 0.78 : 1 })}>
    {busy ? <ActivityIndicator color={secondary ? Colors.primary : "white"} /> : <Text style={{ fontFamily: "sans-semibold", fontSize: 14, color: secondary ? Colors.primary : "white" }}>{label}</Text>}
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 7 }}><Text style={ui.muted}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#797D75" {...props} style={[ui.field, props.multiline && { minHeight: 100, textAlignVertical: "top" }, props.style]} /></View>;
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return <View accessibilityLiveRegion="polite" style={[ui.card, { backgroundColor: "#FFF0E9" }]}><Text style={{ ...ui.text, color: "#9D3128" }}>{message}</Text>{retry && <Action label="Try again" onPress={retry} secondary />}</View>;
}
