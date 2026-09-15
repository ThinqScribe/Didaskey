import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";

import { BootSplash, WelcomeLanding } from "@/components/onboarding/LaunchScreens";
import { useAuthStore } from "@/lib/store/auth";

export default function Index() {
  const { status, user } = useAuthStore();
  const mounted = useRef(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (status !== "unauthenticated") return undefined;
    setShowWelcome(false);
    const timer = setTimeout(() => {
      if (mounted.current) setShowWelcome(true);
    }, 1350);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status === "loading" || status === "offline") return;
    if (status !== "authenticated") return;

    const t = setTimeout(() => {
      if (!mounted.current) return;
      const role = user?.role;
      if (role === "admin") {
        router.replace("/admin");
      } else if (role === "tutor") {
        router.replace("/(tutor)/dashboard");
      } else {
        router.replace("/(tabs)/home");
      }
    }, 0);

    return () => clearTimeout(t);
  }, [status, user?.role]);

  if (!showWelcome) return <BootSplash />;

  return (
    <WelcomeLanding
      onGetStarted={() => router.push("/(auth)/sign-up")}
      onSignIn={() => router.push("/(auth)/sign-in")}
    />
  );
}
