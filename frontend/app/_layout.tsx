import { useEffect } from "react";
import { Stack, router, useSegments } from "expo-router";
import { Text, View } from "react-native";
import { useAuthStore } from "@/lib/store/auth";
import { Action, ui } from "@/components/ui/Workspace";
import { BootSplash } from "@/components/onboarding/LaunchScreens";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import "@/global.css";
import { Colors } from "@/constants";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const { status, user, bootstrap, signOut } = useAuthStore();
  const segments = useSegments();
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => {
    if (status === "loading" || status === "offline") return;
    const group = segments[0];
    const isLanding = !group;
    const authenticatedHome = user?.role === "admin" ? "/admin" : user?.role === "tutor" ? "/(tutor)/dashboard" : "/(tabs)/home";
    if (status === "unauthenticated" && !isLanding && group !== "(auth)") router.replace("/(auth)/sign-in");
    if (status === "authenticated" && (isLanding || group === "(auth)")) router.replace(authenticatedHome);
    if (status === "authenticated" && group === "(tabs)" && user?.role !== "student") router.replace(user?.role === "admin" ? "/admin" : "/(tutor)/dashboard");
    if (status === "authenticated" && group === "(tutor)" && user?.role !== "tutor") router.replace(user?.role === "admin" ? "/admin" : "/(tabs)/home");
    if (status === "authenticated" && group === "admin" && user?.role !== "admin") router.replace("/");
  }, [status, user?.role, segments]);
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
  if (status === "loading") return <BootSplash message="Preparing your learning space." />;
  if (status === "offline") return <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center", padding: 28, gap: 20 }}>
    <Text style={ui.heading}>Let’s reconnect</Text><Text style={ui.text}>We could not check your session. Your saved sign-in is still here.</Text><Action label="Try again" onPress={() => { void bootstrap(); }} /><Action label="Sign out" secondary onPress={() => { void signOut(); }} />
  </View>;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tutor)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="admin" options={{ gestureEnabled: false }} />
      {/* Classroom screens are dark — override the warm-ivory background */}
      <Stack.Screen
        name="classroom/lobby"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0B3F43" },
          animation: "slide_from_bottom",
        }}
      />
      <Stack.Screen
        name="classroom/[bookingId]"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0f172a" },
          animation: "fade",
          // Prevent swiping back mid-session
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}
