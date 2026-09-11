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
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${tutor.display_name}, ${primarySubject}`} onPress={onPress} style={({ pressed }) => ({ backgroundColor: Colors.card, borderRadius: 24, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, opacity: pressed ? 0.76 : 1, shadowColor: Colors.deepTeal, shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 1 })}>
      <View className="flex-row items-center">
      <View className="relative mr-4">
        {tutor.profile_image_url ? (
          <Image source={{ uri: tutor.profile_image_url }} className="w-16 h-16 rounded-[20px]" />
        ) : (
          <View className="w-16 h-16 rounded-[20px] bg-muted items-center justify-center">
            <Ionicons name="person" size={26} color={Colors.mutedForeground} />
          </View>
        )}
        {isOnline && (
          <View className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-teal border-[3px] border-white" />
        )}
      </View>

      <View className="flex-1">
        <Text className="text-[16px] font-sans-bold text-charcoal" numberOfLines={1}>
          {tutor.display_name}
        </Text>
        <Text className="text-[12px] font-sans-medium text-muted-foreground mt-0.5">
          {primarySubject} · {tutor.total_hours_taught} hours taught
        </Text>
        <View className="flex-row items-center gap-1 mt-1">
          <Ionicons name="star" size={12} color={Colors.gold} />
          <Text className="text-[12px] font-sans-semibold text-charcoal">{rating.toFixed(1)}</Text>
          <Text className="text-[12px] font-sans-medium text-muted-foreground">({tutor.review_count})</Text>
        </View>
      </View>

      <View className="items-end gap-2 ml-2">
        {onBookmark && <Pressable accessibilityLabel="Save tutor" accessibilityRole="button" onPress={onBookmark} hitSlop={8}>
          <Ionicons name="bookmark-outline" size={20} color={Colors.deepTeal} />
        </Pressable>}
        <Text className="text-[15px] font-sans-bold text-deep-teal">
          {formatCurrency(rate, tutor.currency, 0)}/hr
        </Text>
      </View>
      </View>
      <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-border">
        <View className="flex-row items-center gap-1.5"><Ionicons name={isOnline ? "videocam-outline" : "location-outline"} size={14} color={Colors.teal} /><Text className="text-[11px] font-sans-semibold text-muted-foreground">{tutor.teaching_mode === "both" ? "Online & in person" : tutor.teaching_mode === "online" ? "Online" : "In person"}</Text></View>
        <View className="flex-row items-center gap-1"><Text className="text-[12px] font-sans-bold text-teal">View profile</Text><Ionicons name="arrow-forward" size={14} color={Colors.teal} /></View>
      </View>
    </Pressable>
  );
}
