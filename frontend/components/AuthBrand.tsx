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
        style={{ width: 190, height: 64 }}
        resizeMode="contain"
      />
      <Text className="auth-title">{title}</Text>
      <Text className="auth-subtitle">{subtitle}</Text>
    </View>
  );
}
