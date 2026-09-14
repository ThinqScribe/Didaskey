import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/lib/store/auth";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";
import { UnreadBadge } from "@/components/ui/UnreadBadge";
import { useUnreadIndicators } from "@/lib/hooks/useUnreadIndicators";

export default function QuickLinks() {
  const user = useAuthStore(s => s.user);
  const unread = useUnreadIndicators();
  const links = [
    { label: "Learning", icon: "book-outline" as const, path: "/learning" as const },
    { label: "Updates", icon: "notifications-outline" as const, path: "/notifications" as const },
    ...(user?.role === "tutor" ? [{ label: "Teaching setup", icon: "options-outline" as const, path: "/tutor-settings" as const }] : []),
  ];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{links.map(link => <Pressable accessibilityRole="button" key={link.label} onPress={() => router.push(link.path)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}><View style={styles.icon}><Ionicons name={link.icon} size={19} color={Colors.deepTeal} />{link.path === "/notifications" && <UnreadBadge count={unread.notifications} style={styles.badge} />}</View><Text style={styles.label}>{link.label}</Text><Ionicons name="arrow-forward" size={15} color={Colors.mutedForeground} /></Pressable>)}</ScrollView>;
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 2 },
  card: { minWidth: 142, minHeight: 62, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.paleTeal, alignItems: "center", justifyContent: "center" },
  badge: { top: -7, right: -7, borderColor: Colors.card },
  label: { flex: 1, fontFamily: "sans-semibold", fontSize: 12, color: Colors.foreground },
});
