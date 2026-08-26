import { View, Text } from "react-native";

interface StatBadgeProps {
  value: string | number;
  label: string;
  divider?: boolean;
}

export default function StatBadge({
  value,
  label,
  divider,
}: StatBadgeProps) {
  return (
    <View className="flex-1 flex-row items-center">
      {divider && (
        <View className="w-px h-10 bg-border" />
      )}

      <View className="flex-1 items-center py-1">
        <Text className="text-[16px] font-sans-bold text-charcoal">
          {value}
        </Text>

        <Text className="text-[10px] font-sans-medium text-muted-foreground mt-1">
          {label}
        </Text>
      </View>
    </View>
  );
}