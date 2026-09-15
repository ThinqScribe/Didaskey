/**
 * Live Classroom Screen — WebView implementation
 *
 * Works in Expo Go AND in a dev build.
 *
 * How it works
 * ------------
 * 1. POST /classrooms/bookings/:id/join  →  livekit_url + token
 * 2. Construct a LiveKit Meet URL:
 *    https://meet.livekit.io/?liveKitUrl=wss://...&token=...
 * 3. Open that URL in a full-screen WebView.
 *    The hosted Meet app handles WebRTC entirely inside the browser —
 *    Expo Go never touches a native WebRTC module.
 * 4. Overlay our own header (title, timer, end/leave button) and
 *    a bottom tab bar for the learning surfaces.
 * 5. Resources and Chat tabs are pure React Native — rendered on top of
 *    the WebView when selected.
 *
 * Why this approach
 * -----------------
 * @livekit/react-native requires compiled native code and cannot run in
 * Expo Go. A WebView-hosted video call works in Expo Go because the
 * browser inside the WebView handles all media — no native module needed.
 * When you later move to a dev build nothing changes; this screen keeps
 * working exactly the same way.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import WebView from "react-native-webview";

import { Colors } from "@/constants";
import LearningWorkspace from "@/components/LearningWorkspace";
import SharedWhiteboard from "@/components/SharedWhiteboard";
import {
  joinClassroom,
  leaveClassroom,
  endClassroom,
  getClassroomStatus,
  type ClassroomJoinResponse,
} from "@/lib/api/classrooms";
import { useAuthStore } from "@/lib/store/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "loading" | "live" | "error" | "ended";
type ClassroomTab = "live" | "board" | "chat" | "resources";



// ── Screen ────────────────────────────────────────────────────────────────────

export default function ClassroomScreen() {
  const params = useLocalSearchParams<{
    bookingId: string;
    title?: string;
    counterpartName?: string;
  }>();

  const bookingId       = Number(params.bookingId);
  const title           = params.title ?? "Live Session";
  const counterpartName = params.counterpartName ?? "";

  const [phase,     setPhase]     = useState<Phase>("loading");
  const [errorMsg,  setErrorMsg]  = useState("");
  const [joinData,  setJoinData]  = useState<ClassroomJoinResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ClassroomTab>("live");
  const [elapsed,   setElapsed]   = useState(0);
  const [ending,    setEnding]    = useState(false);

  const leftRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());
  const { user } = useAuthStore();
  const isTutorRole = user?.role === "tutor" || user?.role === "admin";

  const navigateAway = useCallback(() => {
    if (isTutorRole) router.replace("/(tutor)/sessions" as any);
    else if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/bookings");
  }, [isTutorRole]);

  // ── Join flow ────────────────────────────────────────────────────────────

  const startJoin = useCallback(async () => {
    if (!Number.isFinite(bookingId)) {
      setErrorMsg("Invalid session link.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setErrorMsg("");
    try {
      const data = await joinClassroom(bookingId);
      setJoinData(data);
      const status = await getClassroomStatus(bookingId);
      startedAtRef.current = status.started_at ? Date.parse(status.started_at) : Date.now();
      setPhase("live");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMsg(
        typeof detail === "string"
          ? detail
          : "Could not join the session. Please try again.",
      );
      setPhase("error");
    }
  }, [bookingId]);

  useEffect(() => {
    startJoin();
    return () => {
      if (!leftRef.current) leaveClassroom(bookingId).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Session timer ────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000))), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    let active = true;
    const timer = setInterval(() => {
      void getClassroomStatus(bookingId).then(status => {
        if (active && status.status === "ended") { leftRef.current = true; setPhase("ended"); }
      }).catch(() => undefined);
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [bookingId, phase]);

  const formatTime = (s: number) => {
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // ── Leave / End ──────────────────────────────────────────────────────────

  const handleLeave = useCallback(() => {
    leftRef.current = true;
    leaveClassroom(bookingId).catch(() => undefined);
    navigateAway();
  }, [bookingId, navigateAway]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      "End session for everyone?",
      "This will disconnect all participants and mark the session completed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Session",
          style: "destructive",
          onPress: async () => {
            setEnding(true);
            leftRef.current = true;
            try { await endClassroom(bookingId); setPhase("ended"); }
            catch { leftRef.current = false; Alert.alert("Could not end session", "You are still connected. Please retry."); }
            finally { setEnding(false); }
          },
        },
      ],
    );
  }, [bookingId]);

  // Android hardware back
  useEffect(() => {
    if (phase !== "live") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleLeave();
      return true;
    });
    return () => sub.remove();
  }, [phase, handleLeave]);

  // ── Build the LiveKit Meet URL ────────────────────────────────────────────

  const meetUrl = joinData
    ? `https://meet.livekit.io/custom?liveKitUrl=${encodeURIComponent(joinData.livekit_url)}&token=${encodeURIComponent(joinData.token)}`
    : null;

  // ── Render: loading ──────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: "#0f172a" }}>
        <ActivityIndicator size="large" color={Colors.teal} />
        <Text className="text-white/70 text-[14px] font-sans-medium mt-4">
          Joining classroom…
        </Text>
      </View>
    );
  }

  // ── Render: error ────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "#0f172a" }}>
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: "rgba(239,68,68,0.15)" }}
        >
          <Ionicons name="videocam-off-outline" size={30} color="#f87171" />
        </View>
        <Text className="text-white text-[17px] font-sans-bold mb-2 text-center">
          Could not join
        </Text>
        <Text className="text-white/60 text-[13px] font-sans-medium text-center mb-8">
          {errorMsg}
        </Text>
        <Pressable
          onPress={startJoin}
          className="rounded-full px-8 py-3 mb-3"
          style={{ backgroundColor: Colors.teal }}
        >
          <Text className="text-white font-sans-bold text-[14px]">Try again</Text>
        </Pressable>
        <Pressable onPress={navigateAway}>
          <Text className="text-white/50 text-[13px] font-sans-medium">Go back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Render: ended ────────────────────────────────────────────────────────

  if (phase === "ended") {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "#0f172a" }}>
        <Ionicons name="checkmark-circle" size={56} color={Colors.teal} />
        <Text className="text-white text-[20px] font-sans-bold mt-5 mb-2">
          Session ended
        </Text>
        <Text className="text-white/60 text-[13px] font-sans-medium text-center mb-8">
          The session has been completed. Your attendance has been recorded.
        </Text>
        <Pressable
          onPress={navigateAway}
          className="rounded-full px-8 py-3"
          style={{ backgroundColor: Colors.teal }}
        >
          <Text className="text-white font-sans-bold text-[14px]">
            {isTutorRole ? "View sessions" : "View bookings"}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Render: live ─────────────────────────────────────────────────────────

  return (
    <View className="flex-1" style={{ backgroundColor: "#0f172a" }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#073E42" }}>
        <View style={styles.header}>

          {/* Live dot + title */}
          <View style={styles.headerTitleWrap}>
            <View style={styles.liveDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
              </Text>
              {!!counterpartName && (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  with {counterpartName}
                </Text>
              )}
            </View>
          </View>

          {/* Timer */}
          <View style={styles.timerPill}>
            <Text style={styles.timerText}>
              {formatTime(elapsed)}
            </Text>
          </View>

          {/* End (tutor) or Leave (student) */}
          {isTutorRole ? (
            <Pressable
              onPress={handleEndSession}
              disabled={ending}
              style={styles.endButton}
            >
              {ending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.headerButtonText}>End</Text>
              }
            </Pressable>
          ) : (
            <Pressable
              onPress={handleLeave}
              style={styles.leaveButton}
            >
              <Text style={styles.headerButtonText}>Leave</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {(
          [
            { id: "live",      icon: "videocam",              label: "Live"      },
            { id: "board",     icon: "create",                label: "Board"     },
            { id: "chat",      icon: "chatbubble-ellipses",   label: "Chat"      },
            { id: "resources", icon: "folder-open",           label: "Materials" },
          ] as { id: ClassroomTab; icon: string; label: string }[]
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tabButton, active && styles.tabButtonActive]}
            >
              <Ionicons
                name={tab.icon as any}
                size={16}
                color={active ? "#071D3C" : "rgba(255,255,255,0.55)"}
              />
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Content area ────────────────────────────────────────────── */}
      <View className="flex-1">

        {/* LiveKit Meet WebView — always mounted, hidden when another tab is active */}
        <View style={{ flex: activeTab === "live" ? 1 : 0, overflow: "hidden" }}>
          {meetUrl && (Platform.OS === "web" ? <iframe title="Didaskey live classroom" src={meetUrl} allow="camera; microphone; display-capture; autoplay; fullscreen" style={{ flex: 1, width: "100%", height: "100%", border: 0 }} /> :
            <WebView
              source={{ uri: meetUrl }}
              style={{ flex: 1, backgroundColor: "#0f172a" }}
              // Allow camera + mic inside the WebView
              mediaCapturePermissionGrantType="grant"
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              // Android: hardware layer required for video compositing
              androidLayerType="hardware"
              // Prevent the WebView's own back-navigation from interfering
              onShouldStartLoadWithRequest={(request) => request.url === "about:blank" || /^https:\/\/meet\.livekit\.io(\/|$)/.test(request.url)}
              // Show a spinner until the page loads
              startInLoadingState
              onError={() => { setErrorMsg("Video could not load. Check your connection and try again."); setPhase("error"); }}
              renderLoading={() => (
                <View
                  style={{
                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: "#0f172a",
                  }}
                >
                  <ActivityIndicator color={Colors.teal} />
                  <Text style={{ color: "rgba(255,255,255,0.5)", marginTop: 12, fontSize: 13 }}>
                    Starting video…
                  </Text>
                </View>
              )}
            />
          )}
        </View>

        {activeTab === "board" && (
          <View style={styles.panel}>
            <SharedWhiteboard bookingId={bookingId} />
          </View>
        )}

        {(activeTab === "chat" || activeTab === "resources") && (
          <ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
            <LearningWorkspace
              key={activeTab}
              bookingId={bookingId}
              initialTab={activeTab === "chat" ? "message" : "resource"}
              showBoardButton={false}
            />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 9, backgroundColor: "#073E42" },
  headerTitleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  headerTitle: { fontFamily: "sans-bold", fontSize: 13, color: "#FFFFFF", letterSpacing: 0 },
  headerSubtitle: { marginTop: 1, fontFamily: "sans-medium", fontSize: 10, color: "rgba(255,255,255,0.62)" },
  timerPill: { minHeight: 27, borderRadius: 999, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  timerText: { fontFamily: "sans-bold", fontSize: 11, color: "rgba(255,255,255,0.78)" },
  leaveButton: { minHeight: 29, borderRadius: 999, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  endButton: { minHeight: 29, borderRadius: 999, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(220,38,38,0.92)" },
  headerButtonText: { fontFamily: "sans-bold", fontSize: 11, color: "#FFFFFF" },
  tabBar: { flexDirection: "row", gap: 7, paddingHorizontal: 10, paddingBottom: 9, backgroundColor: "#073E42", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  tabButton: { flex: 1, minHeight: 38, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  tabButtonActive: { backgroundColor: Colors.paleTeal },
  tabText: { fontFamily: "sans-bold", fontSize: 10, color: "rgba(255,255,255,0.55)" },
  tabTextActive: { color: "#071D3C" },
  panel: { flex: 1, padding: 14, backgroundColor: Colors.background },
  panelScroll: { flex: 1, backgroundColor: Colors.background },
  panelContent: { padding: 14, paddingBottom: 24 },
});
