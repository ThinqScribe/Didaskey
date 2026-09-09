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
    <SafeAreaView className="flex-1 bg-deep-teal" edges={["top", "bottom"]}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <View className="flex-row items-center px-4 pt-2 pb-4">
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.white} />
        </Pressable>

        <View className="flex-1 items-center px-2">
          <Text
            className="text-[15px] font-sans-bold text-white"
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!counterpartName && (
            <Text className="text-[12px] font-sans-medium text-white/60">
              with {counterpartName}
            </Text>
          )}
        </View>

        {/* Spacer to balance back button */}
        <View style={{ width: 36 }} />
      </View>

      {/* ── Camera preview ─────────────────────────────────────────── */}
      <View className="mx-4 rounded-3xl overflow-hidden" style={{ height: 320 }}>
        {cameraGranted && cameraOn ? (
          <CameraView
            style={{ flex: 1 }}
            facing="front"
          />
        ) : (
          <View
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: "#1a2a2a" }}
          >
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Ionicons
                name={cameraGranted ? "videocam-off" : "videocam-outline"}
                size={36}
                color="rgba(255,255,255,0.4)"
              />
            </View>
            <Text className="text-[13px] font-sans-medium text-white/40 text-center px-6">
              {cameraGranted
                ? "Camera is off"
                : "Camera permission not granted"}
            </Text>
          </View>
        )}
      </View>

      {/* ── Device controls ────────────────────────────────────────── */}
      <View className="flex-row justify-center gap-5 mt-6 px-4">
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
          className="items-center gap-2"
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{
              backgroundColor: micOn && micGranted
                ? "rgba(13,148,136,0.25)"
                : "rgba(239,68,68,0.2)",
              borderWidth: 1.5,
              borderColor: micOn && micGranted
                ? Colors.teal
                : Colors.destructive,
            }}
          >
            <Ionicons
              name={micOn && micGranted ? "mic" : "mic-off"}
              size={22}
              color={micOn && micGranted ? Colors.teal : Colors.destructive}
            />
          </View>
          <Text className="text-[11px] font-sans-medium text-white/60">
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
          className="items-center gap-2"
        >
          <View
            className="w-14 h-14 rounded-full items-center justify-center"
            style={{
              backgroundColor: cameraOn && cameraGranted
                ? "rgba(13,148,136,0.25)"
                : "rgba(239,68,68,0.2)",
              borderWidth: 1.5,
              borderColor: cameraOn && cameraGranted
                ? Colors.teal
                : Colors.destructive,
            }}
          >
            <Ionicons
              name={cameraOn && cameraGranted ? "videocam" : "videocam-off"}
              size={22}
              color={cameraOn && cameraGranted ? Colors.teal : Colors.destructive}
            />
          </View>
          <Text className="text-[11px] font-sans-medium text-white/60">
            {cameraOn && cameraGranted ? "Camera on" : "Camera off"}
          </Text>
        </Pressable>
      </View>

      {/* ── Permission notice ───────────────────────────────────────── */}
      {(!cameraGranted || !micGranted) && (
        <View
          className="mx-4 mt-5 rounded-xl px-4 py-3 flex-row items-start gap-3"
          style={{ backgroundColor: "rgba(234,179,8,0.12)", borderWidth: 1, borderColor: "rgba(234,179,8,0.3)" }}
        >
          <Ionicons name="warning-outline" size={16} color="#eab308" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[12px] font-sans-medium" style={{ color: "#fde047" }}>
            {!cameraGranted && !micGranted
              ? "Camera and microphone access not granted. You can still join but will be invisible and muted."
              : !cameraGranted
              ? "Camera access not granted. You will join without video."
              : "Microphone access not granted. You will join muted."}
          </Text>
        </View>
      )}

      {/* ── Spacer ─────────────────────────────────────────────────── */}
      <View className="flex-1" />

      {/* ── Join button ────────────────────────────────────────────── */}
      <View className="px-6 pb-6">
        <Pressable
          onPress={handleJoin}
          disabled={joining}
          className="rounded-2xl py-4 items-center justify-center active:opacity-80"
          style={{ backgroundColor: Colors.teal }}
        >
          {joining ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <View className="flex-row items-center gap-2">
              <Ionicons name="videocam" size={18} color={Colors.white} />
              <Text className="text-[16px] font-sans-bold text-white">
                Join Classroom
              </Text>
            </View>
          )}
        </Pressable>

        <Text className="text-center text-[11px] font-sans-medium text-white/40 mt-3">
          Your video and audio settings can be changed once inside.
        </Text>
      </View>
    </SafeAreaView>
  );
}
