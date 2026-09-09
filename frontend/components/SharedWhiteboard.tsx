import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, PanResponder, Text, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { Action, ErrorNotice, ui } from "@/components/ui/Workspace";
import { apiClient } from "@/lib/api/client";
import { extractErrorMessage } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/store/auth";

type Point = [number, number];
type Stroke = { id: number; author_id: number; points: Point[]; color: string; width: number };
type Pending = { client_id: string; points: Point[]; color: string; width: number };
const inks = ["#183D36", "#D35E3F", "#3264A8", "#754C97"];

export default function SharedWhiteboard({ bookingId }: { bookingId: number }) {
  const user = useAuthStore(s => s.user);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [ink, setInk] = useState(inks[0]);
  const [draft, setDraft] = useState<Point[]>([]);
  const points = useRef<Point[]>([]);
  const width = useRef(1);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const fetching = useRef(false);
  const endpoint = `/learning/bookings/${bookingId}/whiteboard`;
  const load = useCallback(async () => {
    if (fetching.current || AppState.currentState !== "active") return;
    fetching.current = true;
    try { const { data } = await apiClient.get<Stroke[]>(endpoint); setStrokes(data); }
    catch (e) { setError(extractErrorMessage(e, "The board could not sync.")); }
    finally { fetching.current = false; }
  }, [endpoint]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 2500); return () => clearInterval(timer); }, [load]);
  const save = useCallback(async (stroke: Pending) => {
    setBusy(true); setError(""); setPending(stroke);
    try { await apiClient.post(endpoint, stroke); setPending(null); setDraft([]); await load(); }
    catch (e) { setError(extractErrorMessage(e, "Stroke not saved. Retry to keep your drawing.")); }
    finally { setBusy(false); }
  }, [endpoint, load]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !busy && !pending,
    onMoveShouldSetPanResponder: () => !busy && !pending,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => {
      const { locationX, locationY } = event.nativeEvent;
      points.current = [[Math.max(0, Math.min(1000, locationX / width.current * 1000)), Math.max(0, Math.min(600, locationY / 320 * 600))]];
      setDraft([...points.current]);
    },
    onPanResponderMove: event => {
      if (points.current.length >= 400) return;
      const { locationX, locationY } = event.nativeEvent;
      points.current.push([Math.max(0, Math.min(1000, locationX / width.current * 1000)), Math.max(0, Math.min(600, locationY / 320 * 600))]);
      setDraft([...points.current]);
    },
    onPanResponderRelease: () => {
      if (points.current.length === 1) points.current.push([...points.current[0]]);
      if (points.current.length >= 2) void save({ client_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, points: [...points.current], color: ink, width: 4 });
    },
    onPanResponderTerminate: () => { points.current = []; setDraft([]); },
  }), [busy, pending, ink, save]);
  async function remove(clear = false) {
    const own = strokes.filter(s => s.author_id === user?.id).at(-1);
    if (!clear && !own) return;
    setBusy(true); setError("");
    try { await apiClient.delete(clear ? endpoint : `${endpoint}/${own!.id}`); setConfirmClear(false); await load(); }
    catch (e) { setError(extractErrorMessage(e)); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 12 }}>
    <Text style={ui.heading}>Shared whiteboard</Text><Text style={ui.muted}>Draw with your finger or mouse. Saved strokes sync every few seconds. Completed sessions keep a read-only copy. Messages and notes remain available as a text alternative.</Text>
    <View style={ui.row}>{inks.map((color, i) => <Action key={color} label={["Teal", "Coral", "Blue", "Purple"][i]} secondary={ink !== color} disabled={busy || !!pending} onPress={() => setInk(color)} />)}</View>
    <View accessible accessibilityLabel="Shared drawing canvas. Use messages or notes for a text alternative." onLayout={e => { width.current = e.nativeEvent.layout.width; }} {...responder.panHandlers} style={{ height: 320, borderRadius: 12, borderWidth: 1, borderColor: "#D8D2C6", backgroundColor: "white", overflow: "hidden", touchAction: "none" }}>
      <Svg width="100%" height="100%" viewBox="0 0 1000 600" preserveAspectRatio="none" pointerEvents="none">
        {strokes.map(s => <Polyline key={s.id} points={s.points.map(p => p.join(",")).join(" ")} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        {draft.length > 0 && <Polyline points={draft.map(p => p.join(",")).join(" ")} stroke={pending?.color ?? ink} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </Svg>
    </View>
    <ErrorNotice message={error} />
    {pending && <Action label="Retry saving stroke" busy={busy} onPress={() => void save(pending)} />}
    <View style={ui.row}><Action label="Undo my last stroke" busy={busy} disabled={!!pending || !strokes.some(s => s.author_id === user?.id)} secondary onPress={() => void remove()} />{user?.role !== "student" && <Action label="Clear board" disabled={busy || !!pending} secondary onPress={() => setConfirmClear(true)} />}</View>
    {confirmClear && <><Text style={ui.text}>Clear everyone’s drawings from this board?</Text><Action label="Yes, clear board" busy={busy} onPress={() => void remove(true)} /><Action label="Keep drawings" secondary onPress={() => setConfirmClear(false)} /></>}
  </View>;
}
