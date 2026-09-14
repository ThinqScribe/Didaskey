import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors, TabBar, TABS } from "@/constants";
import type { TabDef } from "@/constants";
import { UnreadBadge } from "@/components/ui/UnreadBadge";
import { useUnreadIndicators } from "@/lib/hooks/useUnreadIndicators";

const ACTIVE_ICON_BG = "#BFFF4B";
const INACTIVE_ICON = "rgba(255,252,247,0.74)";

function TabIcon({ focused, icon, iconFocused, badgeCount = 0 }: {
  focused: boolean;
  icon: TabDef["icon"];
  iconFocused: TabDef["iconFocused"];
  badgeCount?: number;
}) {
  return (
    <View style={[styles.iconFrame, focused && styles.iconFrameActive]}>
      <Ionicons
        name={focused ? iconFocused : icon}
        size={22}
        color={focused ? Colors.primary : INACTIVE_ICON}
      />
      <UnreadBadge count={badgeCount} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const unread = useUnreadIndicators();
  const bottomOffset = Math.max(insets.bottom, TabBar.horizontalInset);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarShowLabel: false,
            tabBarActiveTintColor: Colors.tabIconActive,
            tabBarInactiveTintColor: Colors.tabIconInactive,
            tabBarIcon: ({ focused }) => (
              <TabIcon focused={focused} icon={tab.icon} iconFocused={tab.iconFocused} badgeCount={tab.name === "chat" ? unread.messages : 0} />
            ),
            tabBarStyle: {
              position: "absolute",
              display: tab.name === "chat" ? "none" : "flex",
              bottom: bottomOffset,
              height: TabBar.height,
              marginHorizontal: TabBar.horizontalInset,
              borderRadius: TabBar.radius,
              backgroundColor: Colors.primary,
              borderTopWidth: 0,
              overflow: "hidden",
              elevation: 0,
            },
            tabBarItemStyle: {
              paddingVertical: (TabBar.height / 2) - (TabBar.iconFrame / 1.6),
            },
            tabBarIconStyle: {
              width: TabBar.iconFrame,
              height: TabBar.iconFrame,
              alignItems: "center",
            },
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconFrame: {
    width: TabBar.iconFrame,
    height: TabBar.iconFrame,
    borderRadius: TabBar.iconFrame / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconFrameActive: {
    backgroundColor: ACTIVE_ICON_BG,
  },
});
