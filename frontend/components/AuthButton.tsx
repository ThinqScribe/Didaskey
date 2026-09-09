import React from "react";
import { ActivityIndicator, Pressable, PressableProps, Text, View } from "react-native";
import { clsx } from "clsx";

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
  ...props
}: AuthButtonProps) {
  const isDisabled = disabled || loading;

  if (variant === "secondary") {
    return (
      <Pressable
        className={clsx("auth-secondary-button", isDisabled && "opacity-50")}
        disabled={isDisabled}
        {...props}
      >
        <Text className="auth-secondary-button-text">{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      className={clsx("auth-button", isDisabled && "auth-button-disabled")}
      disabled={isDisabled}
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
    </Pressable>
  );
}
