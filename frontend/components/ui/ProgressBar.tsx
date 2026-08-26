import { Text, View } from "react-native";
import { Colors } from "@/constants";

interface ProgressBarProps {
  label: string;
  percent: number;
  color?: string;
  showPercent?: boolean;
}

export default function ProgressBar({ label, percent, color = Colors.teal, showPercent = true }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-[13px] font-sans-medium text-muted-foreground">{label}</Text>
        {showPercent && (
          <Text className="text-[15px] font-sans-bold text-charcoal">{clamped}%</Text>
        )}
      </View>
      <View className="h-2 rounded-full bg-muted overflow-hidden">
        <View style={{ width: `${clamped}%`, backgroundColor: color }} className="h-full rounded-full" />
      </View>
    </View>
  );
}
