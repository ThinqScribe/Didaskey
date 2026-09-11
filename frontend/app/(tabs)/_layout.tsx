import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors, TabBar, TABS } from "@/constants";
import type { TabDef } from "@/constants";

function TabIcon({ focused, icon, iconFocused }: {
  focused: boolean;
  icon: TabDef["icon"];
  iconFocused: TabDef["iconFocused"];
}) {
  return (
    <View
      style={{
        width: TabBar.iconFrame,
        height: TabBar.iconFrame,
        borderRadius: TabBar.iconFrame / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? Colors.tabActiveBg : "transparent",
      }}
    >
      <Ionicons
        name={focused ? iconFocused : icon}
        size={22}
        color={focused ? Colors.tabIconActive : Colors.tabIconInactive}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, TabBar.horizontalInset);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarShowLabel: true,
            tabBarLabelStyle: { fontFamily: "sans-semibold", fontSize: 10, marginTop: -3, marginBottom: 8 },
            tabBarActiveTintColor: Colors.tabIconActive,
            tabBarInactiveTintColor: Colors.tabIconInactive,
            tabBarIcon: ({ focused }) => (
              <TabIcon focused={focused} icon={tab.icon} iconFocused={tab.iconFocused} />
            ),
            tabBarStyle: {
              position: "absolute",
              bottom: bottomOffset,
              marginHorizontal: TabBar.horizontalInset,
              height: TabBar.height,
              borderRadius: TabBar.radius,
              backgroundColor: Colors.tabBar,
              borderWidth: 1,
              borderColor: Colors.border,
              elevation: 8,
              shadowColor: Colors.deepTeal,
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.12,
              shadowRadius: 18,
            },
            tabBarItemStyle: {
              paddingTop: 4,
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
