import { Image, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";
import type { TutorSummary } from "@/lib/api/tutors";
import { formatCurrency } from "@/lib/api/bookings";

interface TutorCardProps {
  tutor: TutorSummary;
  onPress?: () => void;
  onBookmark?: () => void;
}

export default function TutorCard({ tutor, onPress, onBookmark }: TutorCardProps) {
  const primarySubject = (tutor.subjects ?? [])[0]?.name ?? "General";
  const rating = parseFloat(tutor.average_rating);
  const rate = parseFloat(tutor.rate_per_hour);
  const isOnline = tutor.teaching_mode === "online" || tutor.teaching_mode === "both";

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${tutor.display_name}, ${primarySubject}`} onPress={onPress} className="flex-row items-center bg-white rounded-[20px] px-4 py-4 mb-3 border border-border/5" style={{ borderColor: "#E6DECF" }}>
      <View className="relative mr-3">
        {tutor.profile_image_url ? (
          <Image source={{ uri: tutor.profile_image_url }} className="w-14 h-14 rounded-full" />
        ) : (
          <View className="w-14 h-14 rounded-full bg-muted items-center justify-center">
            <Ionicons name="person" size={26} color={Colors.mutedForeground} />
          </View>
        )}
        {isOnline && (
          <View className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-teal border-2 border-white" />
        )}
      </View>

      <View className="flex-1">
        <Text className="text-[15px] font-sans-bold text-charcoal" numberOfLines={1}>
          {tutor.display_name}
        </Text>
        <Text className="text-[12px] font-sans-medium text-muted-foreground mt-0.5">
          {primarySubject} · {tutor.total_hours_taught}+ hours
        </Text>
        <View className="flex-row items-center gap-1 mt-1">
          <Ionicons name="star" size={12} color={Colors.gold} />
          <Text className="text-[12px] font-sans-semibold text-charcoal">{rating.toFixed(1)}</Text>
          <Text className="text-[12px] font-sans-medium text-muted-foreground">({tutor.review_count})</Text>
        </View>
      </View>

      <View className="items-end gap-2">
        {onBookmark && <Pressable accessibilityLabel="Save tutor" accessibilityRole="button" onPress={onBookmark} hitSlop={8}>
          <Ionicons name="bookmark-outline" size={20} color={Colors.deepTeal} />
        </Pressable>}
        <Text className="text-[14px] font-sans-bold text-deep-teal">
          {formatCurrency(rate, tutor.currency, 0)}/hr
        </Text>
      </View>
    </Pressable>
  );
}
