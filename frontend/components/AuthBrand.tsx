import React from "react";
import { Image, Text, View } from "react-native";

interface AuthBrandProps {
  title: string;
  subtitle: string;
}

export default function AuthBrand({ title, subtitle }: AuthBrandProps) {
  return (
    <View className="auth-brand-block">
      <Image
        source={require("@/assets/images/logo.png")}
        className="auth-logo"
        resizeMode="contain"
      />
      <Text className="auth-title">{title}</Text>
      <Text className="auth-subtitle">{subtitle}</Text>
    </View>
  );
}
