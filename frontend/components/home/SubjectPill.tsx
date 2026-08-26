import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";
import type { Subject } from "@/lib/api/tutors";

interface SubjectPillProps {
  subject: Subject;
  active?: boolean;
  onPress?: () => void;
}

export default function SubjectPill({ subject, active = false, onPress }: SubjectPillProps) {
  return (
    <Pressable onPress={onPress} className="items-center gap-1 mr-4" hitSlop={6}>
      <View className={`w-14 h-14 rounded-full items-center justify-center ${active ? "bg-deep-teal" : "bg-white"}`}>
        <Ionicons
          name={(subject.icon_name as any) ?? "book-outline"}
          size={24}
          color={active ? Colors.white : Colors.deepTeal}
        />
      </View>
      <Text
        className={`text-[11px] font-sans-semibold text-center ${active ? "text-deep-teal" : "text-muted-foreground"}`}
        numberOfLines={1}
      >
        {subject.name}
      </Text>
    </Pressable>
  );
}

export function MorePill({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} className="items-center gap-1 mr-4" hitSlop={6}>
      <View className="w-14 h-14 rounded-full items-center justify-center bg-white">
        <Ionicons name="ellipsis-horizontal" size={22} color={Colors.deepTeal} />
      </View>
      <Text className="text-[11px] font-sans-semibold text-muted-foreground">More</Text>
    </Pressable>
  );
}
