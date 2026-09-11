import React, { forwardRef, useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { clsx } from "clsx";
import { Colors } from "@/constants";

interface AuthInputProps extends TextInputProps {
  error?: string;
  isPassword?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

const AuthInput = forwardRef<TextInput, AuthInputProps>(
  ({ error, isPassword, icon, ...props }, ref) => {
    const [hidden, setHidden] = useState(true);

    return (
      <View className="auth-field">
        <View className={clsx("auth-input-wrap", error && "auth-input-wrap-error")}>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={Colors.mutedForeground}
              style={{ marginRight: 10 }}
            />
          )}
          <TextInput
            ref={ref}
            className="auth-input"
            secureTextEntry={isPassword ? hidden : false}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={Colors.mutedForeground}
            importantForAutofill="yes"
            {...props}
          />
          {isPassword && (
            <Pressable
              onPress={() => setHidden((v) => !v)}
              hitSlop={8}
            >
              <Ionicons
                name={hidden ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={Colors.mutedForeground}
              />
            </Pressable>
          )}
        </View>
        {error ? <Text className="auth-error">{error}</Text> : null}
      </View>
    );
  }
);

AuthInput.displayName = "AuthInput";

export default AuthInput;
