import { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Colors, Spacing, TabBar } from "@/constants";
import { useRefresh } from "@/lib/hooks/useRefresh";

export default function ChatScreen() {
  // No live data yet — onRefresh is a no-op placeholder
  const { refreshing, onRefresh } = useRefresh(useCallback(async () => {}, []));

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: Colors.background }}>
      {/* Header */}
      <View
        style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.base, paddingBottom: Spacing.base }}
        className="border-b border-border"
      >
        <Text className="text-[22px] font-sans-bold text-charcoal">Messages</Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: Spacing.xl,
          paddingBottom: TabBar.height + TabBar.horizontalInset,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.teal}
            colors={[Colors.teal]}
          />
        }
      >
        <View className="w-20 h-20 rounded-full bg-muted items-center justify-center mb-5">
          <Ionicons name="chatbubble-ellipses-outline" size={36} color={Colors.deepTeal} />
        </View>

        <Text className="text-[18px] font-sans-bold text-charcoal mb-2">
          No messages yet
        </Text>
        <Text className="text-[14px] font-sans-medium text-muted-foreground text-center mb-8">
          Connect with a tutor to start{"\n"}a conversation.
        </Text>

        <Pressable
          onPress={() => router.push("/(tabs)/search")}
          className="rounded-full bg-deep-teal px-8 py-3.5 active:opacity-80"
        >
          <Text className="text-[15px] font-sans-bold text-white">Browse Tutors</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
