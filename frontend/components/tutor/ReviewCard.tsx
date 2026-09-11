import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";
import type { Review } from "@/lib/api/tutors";

interface ReviewCardProps {
  review: Review;
}

function StarRow({ rating }: { rating: number }) {
  return (
    <View className="flex-row gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Ionicons
          key={i}
          name={i < rating ? "star" : "star-outline"}
          size={13}
          color={i < rating ? Colors.gold : Colors.mutedForeground}
        />
      ))}
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ReviewCard({ review }: ReviewCardProps) {
  return (
    <View className="bg-card rounded-[22px] border border-border px-4 py-4 mb-3">
      <View className="flex-row items-center gap-3 mb-2">
        {/* Avatar */}
        <View className="w-9 h-9 rounded-full bg-deep-teal items-center justify-center">
          <Text className="text-[12px] font-sans-bold text-white">
            {initials(review.student_name)}
          </Text>
        </View>

        <View className="flex-1">
          <Text className="text-[14px] font-sans-semibold text-charcoal" numberOfLines={1}>
            {review.student_name}
          </Text>
          <Text className="text-[11px] font-sans-medium text-muted-foreground">
            {formatDate(review.created_at)}
          </Text>
        </View>

        <StarRow rating={review.rating} />
      </View>

      {review.comment ? (
        <Text className="text-[13px] font-sans-medium text-charcoal leading-5">
          {review.comment}
        </Text>
      ) : null}
    </View>
  );
}
