import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Colors, TabBar, TUTOR_TABS } from "@/constants";
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

export default function TutorTabLayout() {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, TabBar.horizontalInset);

  return (
    <Tabs screenOptions={{ headerShown: false }}>
      {TUTOR_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarShowLabel: false,
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
              borderTopWidth: 0,
              elevation: 0,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.15,
              shadowRadius: 16,
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
