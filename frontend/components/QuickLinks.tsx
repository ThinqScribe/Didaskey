import { View } from "react-native";
import { router } from "expo-router";
import { Action, ui } from "@/components/ui/Workspace";
import { useAuthStore } from "@/lib/store/auth";

export default function QuickLinks() {
  const user = useAuthStore(s => s.user);
  return <View style={[ui.row, { paddingHorizontal: 24, paddingVertical: 12 }]}>
    <Action label="Learning & messages" secondary onPress={() => router.push("/learning")} />
    <Action label="Notifications" secondary onPress={() => router.push("/notifications")} />
    {user?.role === "tutor" && <Action label="Teaching setup" secondary onPress={() => router.push("/tutor-settings")} />}
  </View>;
}
