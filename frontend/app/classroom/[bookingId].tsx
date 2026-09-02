/**
 * Live Video Classroom
 *
 * Reached by tapping "Join Session" on a confirmed, online booking from
 * either the student `(tabs)/bookings` screen or the tutor
 * `(tutor)/sessions` screen (see `components/classroom/JoinSessionButton.tsx`).
 *
 * Flow
 * ----
 * 1. Request camera + microphone permissions (see `app.json`'s
 *    `expo-camera` plugin config for the native permission strings).
 *    The call still proceeds even if only one is granted — e.g. a user
 *    who denies camera access can still join with audio only.
 * 2. Request a LiveKit join token from the backend
 *    (`POST /classrooms/bookings/:id/join`). The backend re-validates the
 *    join window, booking status, and participant ownership — this
 *    screen never assumes the window is open just because the button
 *    that led here was tappable.
 * 3. Render a WebView running LiveKit's browser SDK + the interactive
 *    whiteboard (see `lib/classroom/classroomHtml.ts`) with the returned token.
 *    The WebView manages its own layout modes ("video" / "board") internally
 *    and posts a { type:"mode", mode } message so this screen can adapt
 *    its RN overlay accordingly.
 * 4. The tutor (or an admin) sees an "End Session" action which marks the
 *    booking completed and disconnects everyone. Students only get
 *    "Leave", which just records their departure.
 *
 * Board mode considerations
 * ─────────────────────────
 * When the whiteboard is active the WebView renders a 110 px PIP strip at
 * the very top of its own layout.  The RN floating header must therefore
 * sit *below* that strip so it does not cover the video tiles.  We track
 * `boardMode` state (toggled by the "mode" message) and shift the overlay
 * top position accordingly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useCameraPermissions, useMicrophonePermissions } from "expo-camera";

import { Colors } from "@/constants";
import {
  endClassroom,
  joinClassroom,
  leaveClassroom,
  type ClassroomJoinResponse,
} from "@/lib/api/classrooms";
import { SERVER_URL } from "@/lib/api/client";
import { buildClassroomInjection, classroomShellUrl } from "@/lib/classroom/classroomHtml";

type Phase     = "permission" | "loading" | "connecting" | "live" | "error" | "ended";
type BoardMode = "video" | "board";

// Height of the WebView's own PIP strip (mirrors the CSS value in classroomHtml.ts).
const PIP_STRIP_HEIGHT = 110;

export default function ClassroomScreen() {
  const params = useLocalSearchParams<{
    bookingId: string;
    title?: string;
    counterpartName?: string;
  }>();

  const bookingId      = Number(params.bookingId);
  const title          = params.title || "Live Session";
  const counterpartName = params.counterpartName || "";

  const [phase, setPhase]         = useState<Phase>("permission");
  const [errorMessage, setErrorMessage] = useState("");
  const [joinData, setJoinData]   = useState<ClassroomJoinResponse | null>(null);
  const [ending, setEnding]       = useState(false);
  const [canAskPermissionAgain, setCanAskPermissionAgain] = useState(true);

  // Tracks which layout mode the WebView is currently showing so the RN
  // overlay can reposition itself and avoid covering the PIP strip.
  const [boardMode, setBoardMode] = useState<BoardMode>("video");

  const leftRef = useRef(false);
  const webViewRef = useRef<WebView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

  const isTutor = joinData?.role === "tutor" || joinData?.role === "admin";

  // ── Step 1: camera + microphone permissions ───────────────────────────────

  const ensurePermissions = useCallback(async () => {
    const cam = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    const mic = microphonePermission?.granted
      ? microphonePermission
      : await requestMicrophonePermission();

    const granted = !!(cam?.granted || mic?.granted);
    setCanAskPermissionAgain(Boolean(cam?.canAskAgain || mic?.canAskAgain));
    return granted;
  }, [
    cameraPermission,
    microphonePermission,
    requestCameraPermission,
    requestMicrophonePermission,
  ]);

  // ── Step 2: request a LiveKit token ───────────────────────────────────────

  const requestToken = useCallback(async () => {
    setPhase("loading");
    setErrorMessage("");
    try {
      const data = await joinClassroom(bookingId);
      setJoinData(data);
      setPhase("connecting");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMessage(
        typeof detail === "string"
          ? detail
          : "Could not join the session. Please try again."
      );
      setPhase("error");
    }
  }, [bookingId]);

  const startJoinFlow = useCallback(async () => {
    if (!Number.isFinite(bookingId)) {
      setErrorMessage("This session link is invalid.");
      setPhase("error");
      return;
    }
    const granted = await ensurePermissions();
    if (!granted) {
      setPhase("permission");
      return;
    }
    await requestToken();
  }, [bookingId, ensurePermissions, requestToken]);

  // Debug: Log the injection script when joinData changes
  useEffect(() => {
    if (joinData) {
      const injectionScript = buildClassroomInjection({
        livekitUrl: joinData.livekit_url,
        token: joinData.token,
        displayName: joinData.display_name,
        isTutor,
      });
      console.log('[Classroom] Injection script:', injectionScript);
      console.log('[Classroom] Join data:', {
        livekitUrl: joinData.livekit_url,
        tokenLength: joinData.token?.length,
        displayName: joinData.display_name,
        isTutor,
      });
      
      // Log permission status for debugging
      console.log('[Classroom] Permission status:', {
        camera: cameraPermission?.granted,
        microphone: microphonePermission?.granted,
        cameraCanAsk: cameraPermission?.canAskAgain,
        microphoneCanAsk: microphonePermission?.canAskAgain,
      });
    }
  }, [joinData, isTutor, cameraPermission, microphonePermission]);

  useEffect(() => {
    startJoinFlow();
    // Best-effort: tell the backend we left if the screen unmounts without
    // the user explicitly tapping Leave (e.g. swiping back).
    return () => {
      if (!leftRef.current) {
        leaveClassroom(bookingId).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Leaving / ending ───────────────────────────────────────────────────────

  const handleLeave = useCallback(() => {
    leftRef.current = true;
    leaveClassroom(bookingId).catch(() => undefined);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/bookings");
  }, [bookingId]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      "End session for everyone?",
      "This will disconnect all participants and mark the session as completed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Session",
          style: "destructive",
          onPress: async () => {
            setEnding(true);
            try {
              leftRef.current = true;
              await endClassroom(bookingId);
              router.replace("/(tutor)/sessions" as any);
            } catch (err: any) {
              const detail = err?.response?.data?.detail;
              Alert.alert(
                "Couldn't end session",
                typeof detail === "string" ? detail : "Please try again."
              );
            } finally {
              setEnding(false);
            }
          },
        },
      ]
    );
  }, [bookingId]);

  // Android hardware back — treat like the Leave button.
  useEffect(() => {
    if (phase !== "connecting" && phase !== "live") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleLeave();
      return true;
    });
    return () => sub.remove();
  }, [phase, handleLeave]);

  // ── WebView <-> RN messaging ───────────────────────────────────────────────

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);

        switch (msg.type) {
          case "connected":
            setPhase("live");
            break;

          case "leave":
            handleLeave();
            break;

          case "disconnected":
            if (!leftRef.current) setPhase("ended");
            break;

          case "error":
            console.error('[WebView Error Message]', msg);
            const errorDetails = msg.details ? ` (${msg.details})` : '';
            setErrorMessage(msg.message || "The video connection was lost." + errorDetails);
            setPhase("error");
            break;

          case "warning":
            console.warn('[WebView Warning Message]', msg);
            // Show warning but don't change phase
            // This allows the session to continue even if camera/mic fails
            Alert.alert("Media Warning", msg.message || "Camera or microphone access issue");
            break;

          case "request_config":
            console.log('[WebView] Config requested via postMessage');
            if (joinData && webViewRef.current) {
              const config = {
                livekitUrl: joinData.livekit_url,
                token: joinData.token,
                displayName: joinData.display_name,
                isTutor,
              };
              const configMessage = JSON.stringify({
                type: 'config',
                config: config
              });
              console.log('[WebView] Sending config:', configMessage);
              webViewRef.current.postMessage(configMessage);
            }
            break;

          // Whiteboard layout mode changed inside the WebView.
          // Reposition the RN overlay so it clears the PIP strip in board mode.
          case "mode":
            setBoardMode(msg.mode === "board" ? "board" : "video");
            break;

          // participantCount is informational only — no RN state needed.
          default:
            break;
        }
      } catch {
        // Ignore malformed messages.
      }
    },
    [handleLeave, joinData, isTutor]
  );

  const statusBarHeight =
    Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

  // In board mode the WebView renders its own 110 px PIP strip at the top.
  // Offset the RN overlay by that amount so the two layers don't collide.
  const liveOverlayTop = boardMode === "board" ? PIP_STRIP_HEIGHT : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Colors.deepTeal }}>
      <View style={{ height: statusBarHeight }} />

      {/* Header — only shown before/after the call fills the screen */}
      {phase !== "live" && (
        <SafeAreaView edges={["top"]} style={{ backgroundColor: Colors.deepTeal }}>
          <View className="flex-row items-center justify-between px-4 pt-2 pb-3">
            <Pressable
              onPress={handleLeave}
              hitSlop={10}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <Ionicons name="chevron-back" size={20} color={Colors.white} />
            </Pressable>

            <View className="flex-1 items-center">
              <Text className="text-[14px] font-sans-bold text-white" numberOfLines={1}>
                {title}
              </Text>
              {!!counterpartName && (
                <Text className="text-[11px] font-sans-medium text-white/60" numberOfLines={1}>
                  with {counterpartName}
                </Text>
              )}
            </View>

            <View style={{ width: 36 }} />
          </View>
        </SafeAreaView>
      )}

      {/* Floating header while live — overlays the WebView.
          In board mode it sits below the PIP strip so video tiles stay visible. */}
      {phase === "live" && (
        <SafeAreaView
          edges={["top"]}
          style={{
            position: "absolute",
            top: liveOverlayTop,
            left: 0,
            right: 0,
            zIndex: 20,
            // Transparent so the WebView content shows through.
            backgroundColor: "transparent",
          }}
        >
          <View className="flex-row items-center justify-between px-4 pt-2">
            {/* Session title pill — always visible in live mode */}
            <View
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              {/* Live indicator dot */}
              <View className="w-2 h-2 rounded-full bg-teal" />
              <Text className="text-[12px] font-sans-bold text-white" numberOfLines={1}>
                {boardMode === "board" ? "Whiteboard" : title}
              </Text>
            </View>

            {/* End Session — tutor / admin only */}
            {isTutor && (
              <Pressable
                onPress={handleEndSession}
                disabled={ending}
                className="rounded-full px-3 py-1.5 flex-row items-center gap-1"
                style={{ backgroundColor: "rgba(220,38,38,0.85)" }}
              >
                {ending ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Ionicons name="stop-circle-outline" size={14} color={Colors.white} />
                )}
                <Text className="text-[11px] font-sans-bold text-white">End Session</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────── */}

      {phase === "permission" && (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <View
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(142,238,208,0.15)" }}
          >
            <Ionicons name="videocam-outline" size={30} color={Colors.softMint} />
          </View>
          <Text className="text-[15px] font-sans-bold text-white text-center">
            Camera & microphone access needed
          </Text>
          <Text className="text-[13px] font-sans-medium text-white/70 text-center">
            Didaskey needs access to your camera and microphone so your tutor
            or student can see and hear you during the session.
          </Text>
          <View className="flex-row gap-3 mt-2">
            <Pressable onPress={startJoinFlow} className="rounded-xl bg-teal px-5 py-3">
              <Text className="text-[13px] font-sans-bold text-white">
                {canAskPermissionAgain ? "Grant Access" : "Try Again"}
              </Text>
            </Pressable>
            {!canAskPermissionAgain && (
              <Pressable
                onPress={() => Linking.openSettings()}
                className="rounded-xl border border-white/30 px-5 py-3"
              >
                <Text className="text-[13px] font-sans-bold text-white">Open Settings</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={requestToken} className="mt-1">
            <Text className="text-[12px] font-sans-semibold text-white/60 underline">
              Continue without camera/mic
            </Text>
          </Pressable>
        </View>
      )}

      {phase === "loading" && (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <ActivityIndicator size="large" color={Colors.softMint} />
          <Text className="text-[13px] font-sans-medium text-white/70 text-center">
            Preparing your classroom…
          </Text>
        </View>
      )}

      {(phase === "connecting" || phase === "live") && joinData && (
        <WebView
          ref={webViewRef}
          // ── Source: real HTTP origin, not a data: URI ───────────────────
          // getUserMedia is blocked on data: origins on both iOS and Android.
          // Loading the shell from an http:// URL gives the page a real
          // origin so the browser engine grants camera/mic access.
          source={{ uri: classroomShellUrl(SERVER_URL) }}
          // ── Config injection ────────────────────────────────────────────
          // Runs before ANY page script — window.__CLS is set before the
          // classroom boot() function reads it.
          injectedJavaScriptBeforeContentLoaded={buildClassroomInjection({
            livekitUrl:  joinData.livekit_url,
            token:       joinData.token,
            displayName: joinData.display_name,
            isTutor,
          })}
          onMessage={handleWebMessage}
          // ── Debug console logs ──────────────────────────────────────────
          onConsoleMessage={(event) => {
            const message = event.nativeEvent.message;
            console.log('[WebView Console]', message);
            
            // Log critical errors to help debugging
            if (message.includes('getUserMedia') || message.includes('permission') || message.includes('denied')) {
              console.error('[WebView Permission Issue]', message);
            }
            if (message.includes('Connection failed') || message.includes('Failed to connect')) {
              console.error('[WebView Connection Issue]', message);
            }
            if (message.includes('Config not ready') && message.includes('retrying')) {
              console.warn('[WebView Config Issue]', message);
            }
          }}
          // ── Error handling ──────────────────────────────────────────────
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WebView Error]', nativeEvent);
            setErrorMessage('Failed to load classroom. Please check your connection.');
            setPhase('error');
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[WebView HTTP Error]', nativeEvent.statusCode, nativeEvent.url);
          }}
          // ── Loading events for debugging ────────────────────────────────
          onLoadStart={() => {
            console.log('[WebView] Load start');
          }}
          onLoadEnd={() => {
            console.log('[WebView] Load end');
          }}
          onLoadProgress={({ nativeEvent }) => {
            console.log('[WebView] Load progress:', nativeEvent.progress);
          }}
          // ── Media permissions ───────────────────────────────────────────
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // iOS 15+: auto-grant camera/mic permission requests from the page.
          mediaCapturePermissionGrantType="grant"
          // Android: grant camera/mic permission requests from the WebView
          // renderer. Without this the WebView silently denies getUserMedia
          // even though the host app holds the permissions.
          onPermissionRequest={(request) => {
            console.log('[WebView] Permission request:', request.nativeEvent.resources);
            request.grant(request.resources);
          }}
          // ── JS / DOM ────────────────────────────────────────────────────
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={["http://*", "https://*"]}
          // ── Rendering ───────────────────────────────────────────────────
          // Hardware acceleration is required for WebRTC video compositing.
          androidLayerType="hardware"
          style={{ flex: 1, backgroundColor: Colors.deepTeal }}
        />
      )}

      {phase === "error" && (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <View
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(220,38,38,0.15)" }}
          >
            <Ionicons name="alert-circle-outline" size={30} color={Colors.destructive} />
          </View>
          <Text className="text-[15px] font-sans-bold text-white text-center">
            {errorMessage || "Something went wrong."}
          </Text>
          <View className="flex-row gap-3 mt-2">
            <Pressable onPress={requestToken} className="rounded-xl bg-teal px-5 py-3">
              <Text className="text-[13px] font-sans-bold text-white">Try Again</Text>
            </Pressable>
            <Pressable
              onPress={handleLeave}
              className="rounded-xl border border-white/30 px-5 py-3"
            >
              <Text className="text-[13px] font-sans-bold text-white">Go Back</Text>
            </Pressable>
          </View>
        </View>
      )}

      {phase === "ended" && (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <View
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(142,238,208,0.15)" }}
          >
            <Ionicons name="checkmark-circle-outline" size={32} color={Colors.softMint} />
          </View>
          <Text className="text-[15px] font-sans-bold text-white text-center">
            The session has ended.
          </Text>
          <Pressable onPress={handleLeave} className="rounded-xl bg-teal px-6 py-3 mt-2">
            <Text className="text-[13px] font-sans-bold text-white">Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
