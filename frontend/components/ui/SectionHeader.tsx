import { Pressable, Text, View } from "react-native";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <Text className="text-[17px] font-sans-bold text-charcoal">{title}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text className="text-[13px] font-sans-semibold text-teal">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
