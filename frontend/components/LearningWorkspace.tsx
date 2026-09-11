import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiClient } from "@/lib/api/client";
import { Action, Card, ErrorNotice, Field, ui } from "@/components/ui/Workspace";
import { getLearningItems, publishItem, reviewAssignment, submitAssignment, type ItemKind, type LearningItem } from "@/lib/api/learning";
import { extractErrorMessage } from "@/lib/api/auth";
import { useAuthStore } from "@/lib/store/auth";
import { UploadLessonFile, DownloadLessonFile } from "@/components/LessonFiles";
import SharedWhiteboard from "@/components/SharedWhiteboard";
import { Colors } from "@/constants";

const toolTabs: { key: ItemKind; label: string; icon: string }[] = [
  { key: "message", label: "Messages", icon: "💬" },
  { key: "resource", label: "Materials", icon: "📚" },
  { key: "assignment", label: "Practice", icon: "✏️" },
  { key: "note", label: "Notes", icon: "📝" },
];

export default function LearningWorkspace({ bookingId, initialTab = "message" }: { bookingId: number; initialTab?: ItemKind }) {
  const user = useAuthStore(s => s.user);
  const teaching = user?.role === "tutor" || user?.role === "admin";
  const [tab, setTab] = useState<ItemKind>(initialTab);
  const [items, setItems] = useState<LearningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const lastRead = useRef(0);
  const draftRequest = useRef({ payload: "", id: "" });
  useEffect(() => {
    if (boardOpen || tab !== "message" || user?.role === "admin" || AppState.currentState !== "active") return;
    const last = items.filter(i => i.kind === "message").at(-1)?.id ?? 0;
    if (last <= lastRead.current) return;
    void apiClient.put(`/learning/bookings/${bookingId}/read`, { last_item_id: last }).then(() => { lastRead.current = last; }).catch(() => { /* Retry on next refresh. */ });
  }, [items, tab, user?.role, bookingId, boardOpen]);
  const load = useCallback(async () => {
    try { setItems(await getLearningItems(bookingId)); setError(""); }
    catch (e) { setError(extractErrorMessage(e, "Could not load this session. Check your connection.")); }
    finally { setLoading(false); }
  }, [bookingId]);
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); }, 10000); return () => clearInterval(timer); }, [load]);
  async function send() {
    if (!body.trim()) return;
    if (due && Number.isNaN(Date.parse(due))) { setError("Enter a valid due date, such as 2026-10-15."); return; }
    setBusy(true); setError("");
    try {
      const payload = { kind: tab, body: body.trim(), title: title.trim(), ...(url.trim() && tab === "resource" ? { url: url.trim() } : {}), ...(due && tab === "assignment" ? { due_at: new Date(due).toISOString() } : {}) };
      const fingerprint = JSON.stringify({ bookingId, ...payload });
      if (draftRequest.current.payload !== fingerprint) draftRequest.current = { payload: fingerprint, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
      await publishItem(bookingId, { ...payload, client_id: draftRequest.current.id });
      draftRequest.current = { payload: "", id: "" };
      setBody(""); setTitle(""); setUrl(""); setDue(""); await load();
    } catch (e) { setError(extractErrorMessage(e, "Could not save. Your draft is still here.")); }
    finally { setBusy(false); }
  }
  if (boardOpen) return <View style={{ gap: 16 }}><Action label="Back to learning tools" secondary onPress={() => setBoardOpen(false)} /><SharedWhiteboard bookingId={bookingId} /></View>;
  return <View style={{ gap: 16 }}>
    <View style={styles.toolHeader}><View style={{ flex: 1 }}><Text style={styles.toolTitle}>Lesson workspace</Text><Text style={styles.toolSubtitle}>Everything for this lesson, kept together.</Text></View><Pressable accessibilityRole="button" onPress={() => setBoardOpen(true)} style={styles.boardButton}><Text style={styles.boardIcon}>✦</Text><Text style={styles.boardText}>Board</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{toolTabs.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.tabActive]}><Text style={styles.tabIcon}>{item.icon}</Text><Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text></Pressable>)}</ScrollView>
    <ErrorNotice message={error} retry={load} />
    {teaching && tab === "resource" && <Card><UploadLessonFile bookingId={bookingId} reload={load} /></Card>}
    {loading ? <ActivityIndicator /> : items.filter(i => i.kind === tab).length === 0 ? <Card><Text style={ui.heading}>A fresh start</Text><Text style={ui.muted}>{tab === "message" ? "Send a message to prepare for your lesson. Your conversation stays available here." : "Your tutor will share learning activities here."}</Text></Card> : items.filter(i => i.kind === tab).map(item => <Card key={item.id}>
      <Text style={ui.muted}>{item.author_name} · {new Date(item.created_at).toLocaleString()}</Text>
      {!!item.title && <Text style={ui.heading}>{item.title}</Text>}
      <Text selectable style={ui.text}>{item.body}</Text>
      {item.attachment && <DownloadLessonFile itemId={item.id} filename={item.attachment.filename} mediaType={item.attachment.media_type} />}
      {item.kind === "message" && item.author_id === user?.id && <Text style={ui.muted}>{item.read_by_recipient ? "Read" : "Sent"}</Text>}
      {item.due_at && <Text style={ui.muted}>Due {new Date(item.due_at).toLocaleDateString()}</Text>}
      {item.url && <Action label="Open resource" secondary onPress={() => { void Linking.openURL(item.url!).catch(() => setError("This resource could not be opened.")); }} />}
      {item.kind === "assignment" && <Assignment item={item} teaching={teaching} reload={load} />}
    </Card>)}
    {(teaching || tab === "message") && <Card>
      <Text style={ui.heading}>{tab === "message" ? "Keep the conversation going" : `Share ${tab === "assignment" ? "an assignment" : tab === "note" ? "lesson notes" : "a resource"}`}</Text>
      {tab !== "message" && <Field label="Title" value={title} onChangeText={setTitle} maxLength={160} />}
      <Field label={tab === "message" ? "Message" : "Instructions or content"} value={body} onChangeText={setBody} multiline maxLength={20000} />
      {tab === "resource" && <Field label="Resource link (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://…" />}
      {tab === "assignment" && <Field label="Due date (optional, YYYY-MM-DD)" value={due} onChangeText={setDue} placeholder="2026-10-15" />}
      <Action label={tab === "message" ? "Send message" : "Share with student"} onPress={send} busy={busy} disabled={!body.trim() || (tab !== "message" && !title.trim())} />
    </Card>}
  </View>;
}

const styles = StyleSheet.create({
  toolHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  toolTitle: { fontFamily: "sans-bold", fontSize: 20, letterSpacing: -0.35, color: Colors.foreground },
  toolSubtitle: { marginTop: 3, fontFamily: "sans-regular", fontSize: 12, color: Colors.mutedForeground },
  boardButton: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 15, paddingHorizontal: 14, backgroundColor: Colors.deepTeal },
  boardIcon: { fontSize: 17, color: Colors.softMint },
  boardText: { fontFamily: "sans-bold", fontSize: 12, color: "white" },
  tabs: { gap: 8, paddingRight: 10 },
  tab: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 15, paddingHorizontal: 13, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.paleTeal, borderColor: "#B7DCCF" },
  tabIcon: { fontSize: 14 },
  tabText: { fontFamily: "sans-semibold", fontSize: 12, color: Colors.mutedForeground },
  tabTextActive: { color: Colors.deepTeal },
});

function Assignment({ item, teaching, reload }: { item: LearningItem; teaching: boolean; reload: () => Promise<void> }) {
  const [body, setBody] = useState(item.submission?.body ?? "");
  const [feedback, setFeedback] = useState(item.submission?.feedback ?? "");
  const [score, setScore] = useState(item.submission?.score?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (teaching && score && (!Number.isFinite(Number(score)) || !Number.isInteger(Number(score)) || Number(score) < 0 || Number(score) > 100)) { setError("Score must be a whole number from 0 to 100."); return; }
    setBusy(true); setError("");
    try { if (teaching) await reviewAssignment(item.id, feedback, score ? Number(score) : undefined); else await submitAssignment(item.id, body); await reload(); }
    catch (e) { setError(extractErrorMessage(e, "Could not save your work.")); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 12 }}>
    <Text style={ui.muted}>{item.submission?.reviewed_at ? "Reviewed" : item.submission ? "Submitted · awaiting feedback" : "Awaiting submission"}</Text>
    {item.submission && <><Text selectable style={ui.text}>{item.submission.body}</Text>{item.submission.feedback && <Text style={ui.text}>Tutor feedback: {item.submission.feedback}</Text>}{item.submission.score != null && <Text style={ui.heading}>{item.submission.score}/100</Text>}</>}
    {!teaching && !item.submission?.reviewed_at && <><Field label="Your answer" value={body} onChangeText={setBody} multiline maxLength={20000} /><Action label={item.submission ? "Update submission" : "Submit assignment"} onPress={save} busy={busy} disabled={!body.trim()} /></>}
    {teaching && item.submission && <><Field label="Feedback" value={feedback} onChangeText={setFeedback} multiline /><Field label="Score out of 100 (optional)" value={score} onChangeText={setScore} keyboardType="numeric" /><Action label="Save feedback" onPress={save} busy={busy} disabled={!feedback.trim()} /></>}
    <ErrorNotice message={error} />
  </View>;
}
