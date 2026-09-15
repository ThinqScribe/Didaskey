/**
 * Pre-class lobby screen.
 *
 * Shown before entering the live classroom. Lets the user:
 * - Preview their camera feed
 * - Toggle camera and microphone on/off
 * - See session details (subject, tutor name, scheduled time)
 * - Tap "Join Classroom" once they are ready
 *
 * Navigation
 * ----------
 * Reached via router.push('/classroom/lobby', { params: { bookingId, title, counterpartName } })
 * Navigates forward to '/classroom/:bookingId' on join.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";

import { Colors } from "@/constants";

export default function LobbyScreen() {
  const params = useLocalSearchParams<{
    bookingId: string;
    title?: string;
    counterpartName?: string;
  }>();

  const bookingId       = params.bookingId ?? "";
  const title           = params.title ?? "Live Session";
  const counterpartName = params.counterpartName ?? "";

  const [cameraOn, setCameraOn]     = useState(true);
  const [micOn,    setMicOn]        = useState(true);
  const [joining,  setJoining]      = useState(false);

  const [cameraPermission,    requestCamera]    = useCameraPermissions();
  const [micPermission,       requestMic]       = useMicrophonePermissions();

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      if (!cameraPermission?.granted) await requestCamera();
      if (!micPermission?.granted)    await requestMic();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cameraGranted = cameraPermission?.granted ?? false;
  const micGranted    = micPermission?.granted ?? false;

  const handleJoin = useCallback(() => {
    setJoining(true);
    // Pass camera/mic preferences so the classroom screen starts in the
    // same state the user chose here.
    router.replace({
      pathname: `/classroom/${bookingId}` as any,
      params: {
        title,
        counterpartName,
        startCameraOn: cameraOn ? "1" : "0",
        startMicOn:    micOn    ? "1" : "0",
      },
    });
  }, [bookingId, title, counterpartName, cameraOn, micOn]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/bookings");
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.shell}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.white} />
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!counterpartName && (
            <Text style={styles.subtitle} numberOfLines={1}>
              with {counterpartName}
            </Text>
          )}
        </View>

        <View style={styles.headerStatus}>
          <View style={styles.statusDot} />
        </View>
      </View>

      {/* ── Camera preview ─────────────────────────────────────────── */}
      <View style={styles.preview}>
        {cameraGranted && cameraOn ? (
          <CameraView
            style={{ flex: 1 }}
            facing="front"
          />
        ) : (
          <View style={styles.previewEmpty}>
            <View style={styles.previewIcon}>
              <Ionicons
                name={cameraGranted ? "videocam-off" : "videocam-outline"}
                size={36}
                color="rgba(255,255,255,0.4)"
              />
            </View>
            <Text style={styles.previewText}>
              {cameraGranted
                ? "Camera is off"
                : "Camera permission not granted"}
            </Text>
          </View>
        )}
      </View>

      {/* ── Device controls ────────────────────────────────────────── */}
      <View style={styles.controls}>
        {/* Microphone */}
        <Pressable
          onPress={() => {
            if (!micGranted) {
              Alert.alert(
                "Microphone access required",
                "Enable microphone access in Settings to use your mic during sessions.",
              );
              return;
            }
            setMicOn((v) => !v);
          }}
          style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}
        >
          <View
            style={[styles.controlIcon, {
              backgroundColor: micOn && micGranted
                ? "rgba(13,148,136,0.25)"
                : "rgba(239,68,68,0.2)",
              borderWidth: 1.5,
              borderColor: micOn && micGranted
                ? Colors.teal
                : Colors.destructive,
            }]}
          >
            <Ionicons
              name={micOn && micGranted ? "mic" : "mic-off"}
              size={22}
              color={micOn && micGranted ? Colors.teal : Colors.destructive}
            />
          </View>
          <Text style={styles.controlLabel}>
            {micOn && micGranted ? "Mic on" : "Mic off"}
          </Text>
        </Pressable>

        {/* Camera */}
        <Pressable
          onPress={() => {
            if (!cameraGranted) {
              Alert.alert(
                "Camera access required",
                "Enable camera access in Settings to show your video.",
              );
              return;
            }
            setCameraOn((v) => !v);
          }}
          style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}
        >
          <View
            style={[styles.controlIcon, {
              backgroundColor: cameraOn && cameraGranted
                ? "rgba(13,148,136,0.25)"
                : "rgba(239,68,68,0.2)",
              borderWidth: 1.5,
              borderColor: cameraOn && cameraGranted
                ? Colors.teal
                : Colors.destructive,
            }]}
          >
            <Ionicons
              name={cameraOn && cameraGranted ? "videocam" : "videocam-off"}
              size={22}
              color={cameraOn && cameraGranted ? Colors.teal : Colors.destructive}
            />
          </View>
          <Text style={styles.controlLabel}>
            {cameraOn && cameraGranted ? "Camera on" : "Camera off"}
          </Text>
        </Pressable>
      </View>

      {/* ── Permission notice ───────────────────────────────────────── */}
      {(!cameraGranted || !micGranted) && (
        <View
          style={styles.notice}
        >
          <Ionicons name="warning-outline" size={16} color="#eab308" style={{ marginTop: 1 }} />
          <Text style={styles.noticeText}>
            {!cameraGranted && !micGranted
              ? "Camera and microphone access not granted. You can still join but will be invisible and muted."
              : !cameraGranted
              ? "Camera access not granted. You will join without video."
              : "Microphone access not granted. You will join muted."}
          </Text>
        </View>
      )}

      {/* ── Spacer ─────────────────────────────────────────────────── */}
      <View style={styles.spacer} />

      {/* ── Join button ────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleJoin}
          disabled={joining}
          style={({ pressed }) => [styles.joinButton, pressed && styles.pressed, joining && styles.disabled]}
        >
          {joining ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <View style={styles.joinContent}>
              <Ionicons name="videocam" size={18} color={Colors.white} />
              <Text style={styles.joinText}>
                Join Classroom
              </Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.footerText}>
          Your video and audio settings can be changed once inside.
        </Text>
      </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B4A49" },
  shell: { flex: 1, width: "100%", maxWidth: 470, alignSelf: "center", paddingHorizontal: 14 },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4, paddingBottom: 10 },
  backButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  titleBlock: { flex: 1, minWidth: 0, alignItems: "center" },
  title: { fontFamily: "sans-bold", fontSize: 14, color: Colors.white },
  subtitle: { marginTop: 2, fontFamily: "sans-medium", fontSize: 10, color: "rgba(255,255,255,0.62)" },
  headerStatus: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.teal },
  preview: { height: 276, borderRadius: 14, overflow: "hidden", backgroundColor: "#102B2D" },
  previewEmpty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#102B2D" },
  previewIcon: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center", marginBottom: 12, backgroundColor: "rgba(255,255,255,0.08)" },
  previewText: { maxWidth: 250, textAlign: "center", fontFamily: "sans-medium", fontSize: 12, color: "rgba(255,255,255,0.46)" },
  controls: { flexDirection: "row", justifyContent: "center", gap: 22, marginTop: 18 },
  controlButton: { alignItems: "center", gap: 8 },
  controlIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1.3 },
  controlLabel: { fontFamily: "sans-medium", fontSize: 10, color: "rgba(255,255,255,0.62)" },
  notice: { marginTop: 16, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(234,179,8,0.12)", borderWidth: 1, borderColor: "rgba(234,179,8,0.3)" },
  noticeText: { flex: 1, fontFamily: "sans-medium", fontSize: 11, lineHeight: 17, color: "#fde047" },
  spacer: { flex: 1 },
  footer: { paddingHorizontal: 4, paddingBottom: 10 },
  joinButton: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: Colors.teal },
  joinContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  joinText: { fontFamily: "sans-bold", fontSize: 15, color: Colors.white },
  footerText: { marginTop: 11, textAlign: "center", fontFamily: "sans-medium", fontSize: 10, color: "rgba(255,255,255,0.46)" },
  disabled: { opacity: 0.58 },
  pressed: { opacity: 0.76 },
});
