import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Colors } from "@/constants";

export function UnreadBadge({
  count,
  max = 9,
  style,
}: {
  count: number;
  max?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.text}>{count > max ? `${max}+` : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -2,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    backgroundColor: "#BFFF4B",
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  text: {
    fontFamily: "sans-bold",
    fontSize: 10,
    lineHeight: 12,
    color: Colors.primary,
  },
});
