import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import "@/global.css";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "sans-regular":   require("@/assets/images/fonts/PlusJakartaSans-Regular.ttf"),
    "sans-light":     require("@/assets/images/fonts/PlusJakartaSans-Light.ttf"),
    "sans-medium":    require("@/assets/images/fonts/PlusJakartaSans-Medium.ttf"),
    "sans-semibold":  require("@/assets/images/fonts/PlusJakartaSans-SemiBold.ttf"),
    "sans-bold":      require("@/assets/images/fonts/PlusJakartaSans-Bold.ttf"),
    "sans-extrabold": require("@/assets/images/fonts/PlusJakartaSans-ExtraBold.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#f1d3a4" },
      }}
    />
  );
}
