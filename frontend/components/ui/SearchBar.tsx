import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants";

interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
}

export default function SearchBar({ placeholder = "Search tutors or subjects", value, onChangeText, onPress }: SearchBarProps) {
  const inner = (
    <View className="flex-row items-center bg-white rounded-full border border-[#F7F3E9] px-5 h-12 gap-2">
      <Ionicons name="search-outline" size={18} color={Colors.mutedForeground} />
      <TextInput
        editable={!onPress}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.mutedForeground}
        className="flex-1 text-sm font-sans-medium text-charcoal"
      />
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress} className="mb-4">{inner}</Pressable>;
  }

  return <View className="mb-4">{inner}</View>;
}
