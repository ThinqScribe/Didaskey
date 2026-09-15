import React from "react";
import { ActivityIndicator, Pressable, PressableProps, Text, View } from "react-native";
import { clsx } from "clsx";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

interface AuthButtonProps extends PressableProps {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary";
}

export default function AuthButton({
  label,
  loading = false,
  disabled,
  variant = "primary",
  onPressIn,
  onPressOut,
  ...props
}: AuthButtonProps) {
  const isDisabled = disabled || loading;
  const pressedScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressedScale.value }],
  }));
  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
  const handlePressIn: PressableProps["onPressIn"] = (event) => {
    pressedScale.value = withTiming(0.985, { duration: 100 });
    onPressIn?.(event);
  };
  const handlePressOut: PressableProps["onPressOut"] = (event) => {
    pressedScale.value = withTiming(1, { duration: 140 });
    onPressOut?.(event);
  };

  if (variant === "secondary") {
    return (
      <AnimatedPressable
        className={clsx("auth-secondary-button", isDisabled && "opacity-50")}
        disabled={isDisabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={animatedStyle}
        {...props}
      >
        <Text className="auth-secondary-button-text">{label}</Text>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      className={clsx("auth-button", isDisabled && "auth-button-disabled")}
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={animatedStyle}
      {...props}
    >
      {loading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#ffffff" />
          <Text className="auth-button-text">{label}</Text>
        </View>
      ) : (
        <Text className="auth-button-text">{label}</Text>
      )}
    </AnimatedPressable>
  );
}
