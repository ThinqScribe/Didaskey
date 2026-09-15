import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";

export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.eyebrow, light && { color: "#B9E7D8" }]}>{children}</Text>;
}

export function ScreenHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <View style={styles.headingRow}><View style={{ flex: 1, gap: 3 }}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>{action}</View>;
}

export function IconButton({ icon, label, onPress, badge = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; badge?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}>
    <Ionicons name={icon} size={21} color={Colors.deepTeal} />{badge ? <View style={styles.badge} /> : null}
  </Pressable>;
}

export function SectionHeading({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{title}</Text>{actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}><Text style={styles.link}>{actionLabel}</Text></Pressable> : null}</View>;
}

export function Metric({ icon, value, label, tint = Colors.paleTeal }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; tint?: string }) {
  return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: tint }]}><Ionicons name={icon} size={18} color={Colors.deepTeal} /></View><Text numberOfLines={1} style={styles.metricValue}>{value}</Text><Text numberOfLines={1} style={styles.metricLabel}>{label}</Text></View>;
}

export function EmptyState({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name={icon} size={28} color={Colors.deepTeal} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text>{action}</View>;
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: "sans-bold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0, color: Colors.mutedForeground },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontFamily: "sans-bold", fontSize: 24, letterSpacing: 0, color: Colors.foreground },
  subtitle: { fontFamily: "sans-regular", fontSize: 12, lineHeight: 17, color: Colors.mutedForeground },
  iconButton: { width: 37, height: 37, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  badge: { position: "absolute", top: 9, right: 9, width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.coral, borderWidth: 1.5, borderColor: Colors.card },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  sectionTitle: { fontFamily: "sans-bold", fontSize: 16, letterSpacing: 0, color: Colors.foreground },
  link: { fontFamily: "sans-semibold", fontSize: 11, color: Colors.teal },
  metric: { flex: 1, minWidth: 78, borderRadius: 8, padding: 12, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  metricIcon: { width: 29, height: 29, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  metricValue: { fontFamily: "sans-bold", fontSize: 16, color: Colors.foreground },
  metricLabel: { fontFamily: "sans-medium", fontSize: 11, color: Colors.mutedForeground },
  empty: { alignItems: "center", borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 28, backgroundColor: Colors.card, gap: 8 },
  emptyIcon: { width: 54, height: 54, borderRadius: 8, backgroundColor: Colors.paleTeal, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontFamily: "sans-bold", fontSize: 16, color: Colors.foreground },
  emptyBody: { maxWidth: 310, textAlign: "center", fontFamily: "sans-regular", fontSize: 13, lineHeight: 19, color: Colors.mutedForeground },
});
