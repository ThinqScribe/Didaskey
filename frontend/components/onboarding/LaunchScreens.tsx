import { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "@/constants";

const NAVY = "#071D3A";
const TEAL = "#0E8F8A";
const LIME = "#BFFF4B";
const MUTED = "#66718E";

function BackgroundLines() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
      <Circle cx="36" cy="28" r="116" fill="#F7FBFA" />
      <Circle cx="332" cy="150" r="74" fill="#F3F8FA" />
      <Path d="M-30 676 C 58 604 117 760 210 680 C 280 620 323 660 430 594 L 430 844 L -30 844 Z" fill="#D3FAF3" />
      <Path d="M-20 720 C 70 650 132 794 226 716 C 295 660 344 702 428 636 L 428 844 L -20 844 Z" fill="#A7ECE6" opacity="0.9" />
      <Path d="M-18 764 C 86 704 142 826 240 746 C 304 694 350 734 426 690 L 426 844 L -18 844 Z" fill={TEAL} />
      <Path d="M46 188 C 96 154 146 154 196 188 C 246 222 296 222 346 188" stroke="#BDD7D8" strokeWidth="1.2" fill="none" opacity="0.5" />
      <Path d="M52 214 C 102 180 148 180 198 214 C 248 248 294 248 344 214" stroke="#E0E9EF" strokeWidth="1" fill="none" opacity="0.7" />
    </Svg>
  );
}

function Doodle({ icon, style }: { icon: keyof typeof Ionicons.glyphMap; style: object }) {
  return (
    <View style={[styles.doodle, style]}>
      <Ionicons name={icon} size={24} color="#8CBEC1" />
    </View>
  );
}

function ProgressLine() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + progress.value * 0.45,
    transform: [{ scaleX: 0.68 + progress.value * 0.32 }],
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, animatedStyle]} />
    </View>
  );
}

export function BootSplash({ message = "Personalized learning. Trusted guidance." }: { message?: string }) {
  return (
    <SafeAreaView style={styles.splashSafe}>
      <BackgroundLines />
      <Doodle icon="book-outline" style={styles.doodleBook} />
      <Doodle icon="school-outline" style={styles.doodleCap} />
      <Animated.View entering={FadeIn.duration(360)} style={styles.splashCenter}>
        <Image source={require("@/assets/images/logo.png")} style={styles.splashLogo} resizeMode="contain" />
        <Text style={styles.splashMessage}>{message}</Text>
        <ProgressLine />
      </Animated.View>
      <Text style={styles.splashFooter}>Knowledge today. A brighter tomorrow.</Text>
    </SafeAreaView>
  );
}

function HeroIllustration() {
  return (
    <Animated.View entering={FadeInUp.duration(520).delay(150).easing(Easing.out(Easing.cubic))} style={styles.heroWrap}>
      <View style={styles.heroGlow} />
      <View style={styles.portraitCircle}>
        <View style={styles.portraitHead}>
          <Ionicons name="person-outline" size={54} color={NAVY} />
        </View>
        <View style={styles.portraitBody} />
        <View style={styles.tablet}>
          <View style={styles.tabletCamera} />
          <View style={styles.tabletLineWide} />
          <View style={styles.tabletLine} />
        </View>
      </View>

      <View style={styles.lessonCard}>
        <View style={styles.lessonIcon}>
          <Ionicons name="calendar-outline" size={18} color={NAVY} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.lessonTitle}>Today, 6:00 PM</Text>
          <Text style={styles.lessonText}>Personal lesson with a verified tutor</Text>
        </View>
      </View>

      <View style={styles.trustPill}>
        <Ionicons name="shield-checkmark" size={16} color={NAVY} />
        <Text style={styles.trustText}>Verified tutors</Text>
      </View>
    </Animated.View>
  );
}

export function WelcomeLanding({
  onGetStarted,
  onSignIn,
}: {
  onGetStarted: () => void;
  onSignIn: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.welcomeSafe}>
      <BackgroundLines />
      <View style={[styles.welcomeContent, { paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
        <Animated.View entering={FadeInDown.duration(420)} style={styles.brandRow}>
          <Image source={require("@/assets/images/logo.png")} style={styles.brandLogo} resizeMode="contain" />
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>School & university</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(520).delay(80).easing(Easing.out(Easing.cubic))} style={styles.copyBlock}>
          <Text style={styles.headline}>Find the right tutor. Keep learning moving.</Text>
          <Text style={styles.subcopy}>
            Expert tutors, live lessons, shared notes and personal progress for school and university learners.
          </Text>
        </Animated.View>

        <HeroIllustration />

        <Animated.View entering={FadeInUp.duration(460).delay(260).easing(Easing.out(Easing.cubic))} style={styles.featureRow}>
          <View style={styles.featureItem}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={NAVY} />
            <Text style={styles.featureText}>Realtime chat</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="create-outline" size={18} color={NAVY} />
            <Text style={styles.featureText}>Live whiteboard</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(440).delay(330).easing(Easing.out(Easing.cubic))} style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onGetStarted} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSignIn} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Sign In</Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splashSafe: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  splashCenter: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    paddingHorizontal: 28,
  },
  splashLogo: {
    width: 235,
    height: 82,
  },
  splashMessage: {
    marginTop: 12,
    textAlign: "center",
    fontFamily: "sans-medium",
    fontSize: 16,
    lineHeight: 24,
    color: MUTED,
  },
  splashFooter: {
    position: "absolute",
    bottom: 62,
    width: "80%",
    textAlign: "center",
    fontFamily: "sans-semibold",
    fontSize: 13,
    color: "#FFFFFF",
  },
  progressTrack: {
    width: 120,
    height: 4,
    overflow: "hidden",
    marginTop: 28,
    borderRadius: 999,
    backgroundColor: "#DDE9EB",
  },
  progressFill: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: TEAL,
  },
  doodle: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(140,190,193,0.28)",
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  doodleBook: {
    left: 42,
    top: 168,
  },
  doodleCap: {
    right: 46,
    top: 226,
  },
  welcomeSafe: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: Colors.background,
  },
  welcomeContent: {
    flex: 1,
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  brandRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandLogo: {
    width: 142,
    height: 46,
  },
  brandBadge: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: Colors.paleTeal,
  },
  brandBadgeText: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: NAVY,
  },
  copyBlock: {
    marginTop: 14,
  },
  headline: {
    fontFamily: "sans-extrabold",
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: 0,
    color: NAVY,
  },
  subcopy: {
    marginTop: 12,
    maxWidth: 330,
    fontFamily: "sans-medium",
    fontSize: 15,
    lineHeight: 23,
    color: MUTED,
  },
  heroWrap: {
    flex: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlow: {
    position: "absolute",
    width: 248,
    height: 248,
    borderRadius: 124,
    backgroundColor: Colors.paleTeal,
  },
  portraitCircle: {
    width: 214,
    height: 214,
    overflow: "hidden",
    borderRadius: 107,
    alignItems: "center",
    backgroundColor: "#F8FBFC",
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.08)",
  },
  portraitHead: {
    width: 94,
    height: 94,
    marginTop: 34,
    borderRadius: 47,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF6F5",
  },
  portraitBody: {
    width: 150,
    height: 110,
    marginTop: -2,
    borderTopLeftRadius: 78,
    borderTopRightRadius: 78,
    backgroundColor: NAVY,
  },
  tablet: {
    position: "absolute",
    right: 22,
    bottom: 38,
    width: 88,
    height: 68,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#314156",
    transform: [{ rotate: "-8deg" }],
  },
  tabletCamera: {
    width: 6,
    height: 6,
    alignSelf: "flex-end",
    borderRadius: 3,
    backgroundColor: "#9FB0C6",
  },
  tabletLineWide: {
    width: 48,
    height: 5,
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: "#AFC0D8",
  },
  tabletLine: {
    width: 32,
    height: 5,
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: "#DDE7F5",
  },
  lessonCard: {
    position: "absolute",
    left: 10,
    bottom: 26,
    width: 220,
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 18,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(7,29,58,0.09)",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 5,
  },
  lessonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.paleTeal,
  },
  lessonTitle: {
    fontFamily: "sans-bold",
    fontSize: 13,
    color: NAVY,
  },
  lessonText: {
    marginTop: 2,
    fontFamily: "sans-medium",
    fontSize: 11,
    lineHeight: 15,
    color: MUTED,
  },
  trustPill: {
    position: "absolute",
    right: 6,
    top: 44,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 13,
    backgroundColor: LIME,
  },
  trustText: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: NAVY,
  },
  featureRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  featureItem: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 999,
    backgroundColor: "#F2F6F8",
  },
  featureText: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: NAVY,
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: 999,
    backgroundColor: NAVY,
  },
  primaryText: {
    fontFamily: "sans-bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  secondaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  secondaryText: {
    fontFamily: "sans-bold",
    fontSize: 15,
    color: NAVY,
  },
  pressed: {
    opacity: 0.76,
  },
});
