import { ReactNode, useEffect } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
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

export function ScreenFade({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeIn.duration(320).easing(Easing.out(Easing.cubic))} style={style}>
      {children}
    </Animated.View>
  );
}

export function Rise({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={FadeInUp.duration(420).delay(delay).easing(Easing.out(Easing.cubic))} style={style}>
      {children}
    </Animated.View>
  );
}

export function DropIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(360).delay(delay).easing(Easing.out(Easing.cubic))} style={style}>
      {children}
    </Animated.View>
  );
}

export function SkeletonBlock({
  width = "100%",
  height,
  radius = 8,
  style,
}: {
  width?: ViewStyle["width"];
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + progress.value * 0.26,
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius: radius },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function LoadingState({ compact = false }: { compact?: boolean }) {
  if (!compact) return <MobileCardSkeletonGrid />;

  return (
    <Animated.View entering={FadeIn.duration(240)} style={[styles.loadingWrap, compact && styles.loadingCompact]}>
      <SkeletonBlock width={compact ? "58%" : "72%"} height={18} radius={999} />
      <SkeletonBlock width="100%" height={compact ? 68 : 96} />
      <SkeletonBlock width="86%" height={compact ? 54 : 74} />
      {!compact && <SkeletonBlock width="64%" height={16} radius={999} />}
    </Animated.View>
  );
}

export function MobileCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <Animated.View entering={FadeIn.duration(240)} style={styles.cardGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View
          key={index}
          entering={FadeInUp.duration(360).delay(index * 35).easing(Easing.out(Easing.cubic))}
          style={styles.cardSkeleton}
        >
          <SkeletonBlock height={82} radius={0} style={styles.cardMedia} />
          <View style={styles.cardBody}>
            <SkeletonBlock width="74%" height={9} radius={999} />
            <SkeletonBlock width="48%" height={8} radius={999} />
            <View style={styles.dotRow}>
              <SkeletonBlock width={10} height={10} radius={5} />
              <SkeletonBlock width={10} height={10} radius={5} />
              <SkeletonBlock width={10} height={10} radius={5} />
              <SkeletonBlock width={10} height={10} radius={5} />
            </View>
          </View>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

export function MobileListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Animated.View entering={FadeIn.duration(240)} style={styles.listSkeleton}>
      {Array.from({ length: count }).map((_, index) => (
        <Animated.View
          key={index}
          entering={FadeInUp.duration(340).delay(index * 40).easing(Easing.out(Easing.cubic))}
          style={styles.listRow}
        >
          <SkeletonBlock width={48} height={48} radius={24} />
          <View style={styles.listCopy}>
            <SkeletonBlock width="68%" height={12} radius={999} />
            <SkeletonBlock width="90%" height={9} radius={999} />
            <SkeletonBlock width="46%" height={9} radius={999} />
          </View>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: Colors.muted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(7,29,58,0.04)",
  },
  loadingWrap: {
    width: "100%",
    gap: 12,
    padding: 16,
  },
  loadingCompact: {
    padding: 0,
  },
  cardGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 4,
  },
  cardSkeleton: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 142,
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.deepTeal,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardMedia: {
    borderRadius: 0,
    borderWidth: 0,
  },
  cardBody: {
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  dotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  listSkeleton: {
    width: "100%",
    gap: 12,
    padding: 4,
  },
  listRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 8,
    padding: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  listCopy: {
    flex: 1,
    gap: 9,
  },
});
