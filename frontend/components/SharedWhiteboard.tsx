import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Line, Polyline } from "react-native-svg";

import { ErrorNotice } from "@/components/ui/Workspace";
import { Colors } from "@/constants";
import { apiClient } from "@/lib/api/client";
import { createWhiteboardSocket, getWhiteboardStrokes, type BoardStroke } from "@/lib/api/learning";
import { extractErrorMessage } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/store/auth";

type Point = [number, number];
type PendingStroke = Omit<BoardStroke, "id" | "author_id">;

const inks = ["#183D36", "#D35E3F", "#3264A8", "#754C97"] as const;
const inkLabels = ["Deep teal", "Coral", "Blue", "Purple"];
const strokeWidths = [3, 5, 8] as const;

function mergeStroke(list: BoardStroke[], stroke: BoardStroke): BoardStroke[] {
  const index = list.findIndex(item => item.id === stroke.id);
  if (index === -1) return [...list, stroke].sort((a, b) => a.id - b.id);
  const next = [...list];
  next[index] = stroke;
  return next.sort((a, b) => a.id - b.id);
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, value));
}

export default function SharedWhiteboard({ bookingId }: { bookingId: number }) {
  const user = useAuthStore(s => s.user);
  const dimensions = useWindowDimensions();
  const [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [ink, setInk] = useState<string>(inks[0]);
  const [strokeWidth, setStrokeWidth] = useState<number>(5);
  const [draft, setDraft] = useState<Point[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingStroke | null>(null);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [connected, setConnected] = useState(false);
  const points = useRef<Point[]>([]);
  const canvasWidth = useRef(1);
  const canvasHeight = useRef(1);
  const fetching = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingClientRef = useRef<string | null>(null);
  const endpoint = `/learning/bookings/${bookingId}/whiteboard`;
  const boardHeight = Math.max(300, Math.min(430, Math.round(dimensions.height * 0.52)));

  const load = useCallback(async () => {
    if (fetching.current || AppState.currentState !== "active") return;
    fetching.current = true;
    try {
      setStrokes(await getWhiteboardStrokes(bookingId));
      setError("");
    } catch (e) {
      setError(extractErrorMessage(e, "The board could not sync."));
    } finally {
      fetching.current = false;
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (socketRef.current?.readyState !== WebSocket.OPEN) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    pendingClientRef.current = pending?.client_id ?? null;
  }, [pending?.client_id]);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      try {
        const socket = await createWhiteboardSocket(bookingId);
        socketRef.current = socket;
        socket.onopen = () => {
          if (!stopped) setConnected(true);
        };
        socket.onmessage = event => {
          try {
            const payload = JSON.parse(String(event.data));
            if (payload.type === "stroke" && payload.stroke) {
              setStrokes(current => mergeStroke(current, payload.stroke));
              if (payload.stroke.client_id && payload.stroke.client_id === pendingClientRef.current) {
                setPending(null);
              }
            } else if (payload.type === "undo" && payload.stroke_id) {
              setStrokes(current => current.filter(stroke => stroke.id !== payload.stroke_id));
            } else if (payload.type === "clear") {
              setStrokes([]);
              setConfirmClear(false);
            } else if (payload.type === "error" && payload.detail) {
              setError(String(payload.detail));
            }
          } catch {
            setError("The board received an unreadable update.");
          }
        };
        socket.onerror = () => {
          if (!stopped) setConnected(false);
        };
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (stopped) return;
          setConnected(false);
          retry = setTimeout(connect, 1800);
        };
      } catch {
        if (!stopped) retry = setTimeout(connect, 2400);
      }
    };

    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [bookingId]);

  const save = useCallback(async (stroke: PendingStroke) => {
    setBusy(true);
    setError("");
    setPending(stroke);
    try {
      const { data } = await apiClient.post<BoardStroke>(endpoint, stroke, { timeout: 30000 });
      setStrokes(current => mergeStroke(current, data));
      setPending(null);
      setDraft([]);
    } catch (e) {
      setError(extractErrorMessage(e, "Stroke not saved. Retry to keep your drawing."));
    } finally {
      setBusy(false);
    }
  }, [endpoint]);

  const responder = useMemo(() => ({
    onStartShouldSetResponder: () => !busy,
    onMoveShouldSetResponder: () => !busy,
    onResponderGrant: (event: any) => {
      const { locationX, locationY } = event.nativeEvent;
      points.current = [[
        clamp((locationX / canvasWidth.current) * 1000, 1000),
        clamp((locationY / canvasHeight.current) * 600, 600),
      ]];
      setDraft([...points.current]);
    },
    onResponderMove: (event: any) => {
      if (points.current.length >= 400) return;
      const { locationX, locationY } = event.nativeEvent;
      points.current.push([
        clamp((locationX / canvasWidth.current) * 1000, 1000),
        clamp((locationY / canvasHeight.current) * 600, 600),
      ]);
      setDraft([...points.current]);
    },
    onResponderRelease: () => {
      if (points.current.length === 1) points.current.push([...points.current[0]]);
      if (points.current.length >= 2) {
        const stroke: PendingStroke = {
          client_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          points: [...points.current],
          color: ink,
          width: strokeWidth,
        };
        void save(stroke);
      }
      points.current = [];
    },
    onResponderTerminate: () => {
      points.current = [];
      setDraft([]);
    },
  }), [busy, ink, strokeWidth, save]);

  async function remove(clear = false) {
    const own = strokes.filter(stroke => stroke.author_id === user?.id).at(-1);
    if (!clear && !own) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.delete(clear ? endpoint : `${endpoint}/${own!.id}`);
      if (clear) {
        setStrokes([]);
        setConfirmClear(false);
      } else {
        setStrokes(current => current.filter(stroke => stroke.id !== own!.id));
      }
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Whiteboard</Text>
          <Text style={styles.subtitle}>{strokes.length ? `${strokes.length} stroke${strokes.length === 1 ? "" : "s"}` : "Ready for illustration"}</Text>
        </View>
        <View style={[styles.livePill, connected ? styles.livePillOn : styles.livePillOff]}>
          <View style={[styles.liveDot, connected ? styles.liveDotOn : styles.liveDotOff]} />
          <Text style={[styles.liveText, !connected && styles.liveTextOff]}>{connected ? "Live" : "Syncing"}</Text>
        </View>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.swatches}>
          {inks.map((color, index) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={inkLabels[index]}
              onPress={() => setInk(color)}
              disabled={busy}
              style={[styles.swatch, { backgroundColor: color }, ink === color && styles.swatchActive]}
            />
          ))}
        </View>
        <View style={styles.widthGroup}>
          {strokeWidths.map(width => (
            <Pressable
              key={width}
              accessibilityRole="button"
              accessibilityLabel={`Brush ${width}`}
              onPress={() => setStrokeWidth(width)}
              disabled={busy}
              style={[styles.widthButton, strokeWidth === width && styles.widthButtonActive]}
            >
              <View style={[styles.widthDot, { width, height: width, borderRadius: width / 2 }, strokeWidth === width && styles.widthDotActive]} />
            </Pressable>
          ))}
        </View>
      </View>

      <View
        accessible
        accessibilityLabel="Shared drawing canvas"
        onLayout={event => {
          canvasWidth.current = Math.max(1, event.nativeEvent.layout.width);
          canvasHeight.current = Math.max(1, event.nativeEvent.layout.height);
        }}
        {...responder}
        style={[
          styles.canvas,
          { height: boardHeight },
          Platform.OS === "web" ? ({ touchAction: "none" } as any) : null,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 1000 600" preserveAspectRatio="none" pointerEvents="none">
          {[200, 400, 600, 800].map(x => <Line key={`x-${x}`} x1={x} y1={0} x2={x} y2={600} stroke="#EEF2F6" strokeWidth={2} />)}
          {[150, 300, 450].map(y => <Line key={`y-${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="#EEF2F6" strokeWidth={2} />)}
          {strokes.map(stroke => (
            <Polyline
              key={stroke.id}
              points={stroke.points.map(point => point.join(",")).join(" ")}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {draft.length > 0 && (
            <Polyline
              points={draft.map(point => point.join(",")).join(" ")}
              stroke={pending?.color ?? ink}
              strokeWidth={pending?.width ?? strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </Svg>
        {busy && (
          <View style={styles.savingPill}>
            <ActivityIndicator size="small" color={Colors.deepTeal} />
            <Text style={styles.savingText}>Saving</Text>
          </View>
        )}
      </View>

      <ErrorNotice message={error} />

      {pending && !busy && (
        <Pressable accessibilityRole="button" onPress={() => void save(pending)} style={styles.retryButton}>
          <Ionicons name="refresh" size={16} color={Colors.deepTeal} />
          <Text style={styles.retryText}>Retry stroke</Text>
        </Pressable>
      )}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={busy || !strokes.some(stroke => stroke.author_id === user?.id)}
          onPress={() => void remove()}
          style={({ pressed }) => [styles.actionButton, (busy || !strokes.some(stroke => stroke.author_id === user?.id)) && styles.disabled, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-undo-outline" size={17} color={Colors.deepTeal} />
          <Text style={styles.actionText}>Undo</Text>
        </Pressable>
        {user?.role !== "student" && (
          <Pressable
            accessibilityRole="button"
            disabled={busy || strokes.length === 0}
            onPress={() => setConfirmClear(true)}
            style={({ pressed }) => [styles.actionButton, (busy || strokes.length === 0) && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons name="trash-outline" size={17} color={Colors.deepTeal} />
            <Text style={styles.actionText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {confirmClear && (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Clear everyone’s drawings?</Text>
          <View style={styles.confirmActions}>
            <Pressable onPress={() => setConfirmClear(false)} style={styles.confirmSecondary}>
              <Text style={styles.confirmSecondaryText}>Keep</Text>
            </Pressable>
            <Pressable onPress={() => void remove(true)} style={styles.confirmPrimary}>
              <Text style={styles.confirmPrimaryText}>Clear board</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontFamily: "sans-bold", fontSize: 22, color: Colors.foreground, letterSpacing: 0 },
  subtitle: { marginTop: 2, fontFamily: "sans-medium", fontSize: 12, color: Colors.mutedForeground },
  livePill: { minHeight: 32, borderRadius: 999, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7 },
  livePillOn: { backgroundColor: Colors.paleTeal },
  livePillOff: { backgroundColor: Colors.muted },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveDotOn: { backgroundColor: Colors.teal },
  liveDotOff: { backgroundColor: Colors.mutedForeground },
  liveText: { fontFamily: "sans-bold", fontSize: 12, color: Colors.deepTeal },
  liveTextOff: { color: Colors.mutedForeground },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  swatches: { flexDirection: "row", alignItems: "center", gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: Colors.card },
  swatchActive: { borderColor: Colors.success },
  widthGroup: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, padding: 4 },
  widthButton: { width: 32, height: 28, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  widthButtonActive: { backgroundColor: Colors.paleTeal },
  widthDot: { backgroundColor: Colors.mutedForeground },
  widthDotActive: { backgroundColor: Colors.deepTeal },
  canvas: { borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: "#FFFFFF", overflow: "hidden" },
  savingPill: { position: "absolute", right: 12, bottom: 12, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.paleTeal, flexDirection: "row", alignItems: "center", gap: 8 },
  savingText: { fontFamily: "sans-bold", fontSize: 12, color: Colors.deepTeal },
  retryButton: { minHeight: 42, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  retryText: { fontFamily: "sans-bold", fontSize: 13, color: Colors.deepTeal },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionButton: { flex: 1, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionText: { fontFamily: "sans-bold", fontSize: 13, color: Colors.deepTeal },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  confirm: { borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.paleTeal, padding: 12, gap: 12 },
  confirmText: { fontFamily: "sans-semibold", fontSize: 14, color: Colors.foreground },
  confirmActions: { flexDirection: "row", gap: 8 },
  confirmSecondary: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: Colors.card },
  confirmSecondaryText: { fontFamily: "sans-bold", fontSize: 13, color: Colors.deepTeal },
  confirmPrimary: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: Colors.deepTeal },
  confirmPrimaryText: { fontFamily: "sans-bold", fontSize: 13, color: "#FFFFFF" },
});
