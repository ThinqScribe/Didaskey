import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-[17px] font-sans-bold text-charcoal">Profile</Text>
      </View>
    </SafeAreaView>
  );
}
