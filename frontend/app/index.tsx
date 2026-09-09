/**
 * Entry point — waits for the auth bootstrap to complete before
 * redirecting. This prevents the "flash to sign-in" on reload.
 *
 * Navigation is deferred to the next tick so the Root Layout's <Stack>
 * has a chance to mount before router.replace is called.
 */
import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuthStore } from "@/lib/store/auth";

export default function Index() {
  const { status, user } = useAuthStore();
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Authentication is hydrated by the root layout, including deep links.
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (status === "loading" || status === "offline") return;

    const t = setTimeout(() => {
      if (!mounted.current) return;
      if (status === "authenticated") {
        const role = user?.role;
        if (role === "admin") {
          router.replace("/admin");
        } else if (role === "tutor") {
          router.replace("/(tutor)/dashboard");
        } else {
          router.replace("/(tabs)/home");
        }
      } else {
        router.replace("/(auth)/sign-in");
      }
    }, 0);

    return () => clearTimeout(t);
  }, [status, user?.role]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F1E5" }}>
      <ActivityIndicator size="large" color="#17A389" />
    </View>
  );
}
