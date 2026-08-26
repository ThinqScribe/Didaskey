import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import Constants from "expo-constants";
import { PaystackProvider } from "react-native-paystack-webview";
import "@/global.css";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Public key is safe to embed — it is not a secret.
const PAYSTACK_PUBLIC_KEY: string =
  (Constants.expoConfig?.extra?.paystackPublicKey as string) ?? "";

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
    <PaystackProvider publicKey={PAYSTACK_PUBLIC_KEY}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F5F0E8" },
        }}
      />
    </PaystackProvider>
  );
}
