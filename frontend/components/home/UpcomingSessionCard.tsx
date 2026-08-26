import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";

export interface UpcomingSession {
  dateLabel: string;
  subject: string;
  tutorName: string;
  sessionId?: number;
}

interface UpcomingSessionCardProps {
  session: UpcomingSession;
  onJoin?: () => void;
}

export default function UpcomingSessionCard({ session, onJoin }: UpcomingSessionCardProps) {
  return (
    <View className="bg-white rounded-2xl border border-border px-4 py-4">
      <View className="flex-row items-center gap-2 mb-1">
        <Ionicons name="time-outline" size={15} color={Colors.mutedForeground} />
        <Text className="text-[13px] font-sans-semibold text-muted-foreground">{session.dateLabel}</Text>
      </View>
      <View className="flex-row items-center justify-between mt-1">
        <View className="flex-1 pr-3">
          <Text className="text-[15px] font-sans-bold text-charcoal" numberOfLines={1}>{session.subject}</Text>
          <Text className="text-[12px] font-sans-medium text-muted-foreground mt-0.5" numberOfLines={1}>
            with {session.tutorName}
          </Text>
        </View>
        <Pressable onPress={onJoin} className="bg-deep-teal rounded-full px-4 py-2">
          <Text className="text-[13px] font-sans-bold text-white">Join Class</Text>
        </Pressable>
      </View>
    </View>
  );
}
