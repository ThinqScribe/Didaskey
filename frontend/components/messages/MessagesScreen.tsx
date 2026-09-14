import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File as FsFile, Paths } from "expo-file-system";

import { Colors } from "@/constants";
import { extractErrorMessage } from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";
import {
  createMessageSocket,
  getConversationMessages,
  getConversations,
  markConversationRead,
  reactToMessage,
  sendConversationMessage,
  uploadMessageAttachment,
  type Conversation,
  type LearningItem,
} from "@/lib/api/learning";
import { useAuthStore } from "@/lib/store/auth";

const NAVY = "#071D3A";
const LIME = "#BFFF4B";
const MUTED_NAVY = "#66718E";
const SOFT_MINT = "#D3FAF3";
const DIVIDER = "#DAD8D2";
const AVATAR_IMAGES: Record<string, string> = {
  "Engr. David Smith": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "David Smith": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "Prof. Linda Chen": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "Linda Chen": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "Dr. Alex Morgan": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "Alex Morgan": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "Dr. Aisha Musa": "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "Aisha Musa": "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&fm=jpg&q=80&w=320",
};

type Filter = "all" | "unread" | "tutors" | "support";

function mergeMessage(list: LearningItem[], incoming: LearningItem) {
  const next = list.some(item => item.id === incoming.id || (!!incoming.client_id && item.client_id === incoming.client_id))
    ? list.map(item => item.id === incoming.id || (!!incoming.client_id && item.client_id === incoming.client_id) ? incoming : item)
    : [...list, incoming];
  return next.sort((a, b) => {
    const byTime = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return byTime || a.id - b.id;
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function relativeStamp(value: string) {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return formatTime(value);
  if (diff === -1) return "Yesterday";
  if (diff > -7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function lessonDateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? `Today, ${formatTime(value)}`
    : `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${formatTime(value)}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}

function isSupportConversation(conversation: Conversation) {
  return conversation.title.toLowerCase().includes("support") || conversation.counterpart.toLowerCase().includes("support");
}

function counterpartRoleLabel(conversation: Conversation, userRole?: string) {
  if (isSupportConversation(conversation)) return "Support";
  if (userRole === "tutor") return "Student";
  return conversation.title === "Tutoring session" ? "Tutor" : `${conversation.title} tutor`;
}

function lessonTitleLabel(conversation: Conversation) {
  return conversation.title === "Tutoring session" ? "Lesson" : conversation.title;
}

function messagePreview(message: LearningItem) {
  if (message.attachment) return message.title ? `I've attached ${message.title}.` : message.body;
  return message.body;
}

function authorName(user: { first_name: string; last_name: string } | null | undefined) {
  return user ? `${user.first_name} ${user.last_name}`.trim() : "You";
}

function confirmedMessage(sent: LearningItem, optimistic: LearningItem): LearningItem {
  return {
    ...optimistic,
    ...sent,
    author_name: sent.author_name || optimistic.author_name,
    submission: sent.submission ?? null,
    reply_to: sent.reply_to ?? optimistic.reply_to ?? null,
    reactions: sent.reactions ?? [],
    attachment: sent.attachment ?? null,
    extra: sent.extra ?? {},
    pending: false,
    failed: false,
  };
}

function shouldMarkSendFailed(err: any) {
  const status = err?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500 && ![408, 409, 429].includes(status);
}

function applyConversationMessage(
  list: Conversation[],
  message: LearningItem,
  activeBookingId: number | null,
  selfId?: number,
) {
  return list.map(conversation => {
    if (conversation.booking_id !== message.booking_id) return conversation;
    const isIncoming = message.author_id !== selfId;
    return {
      ...conversation,
      last_message: messagePreview(message),
      last_message_at: message.created_at,
      unread_count: isIncoming && activeBookingId !== conversation.booking_id
        ? (conversation.unread_count ?? 0) + 1
        : activeBookingId === conversation.booking_id ? 0 : conversation.unread_count,
    };
  });
}

function applyReadReceipt(list: LearningItem[], readerId: number, lastItemId: number, selfId?: number) {
  if (readerId === selfId) return list;
  return list.map(message => (
    message.author_id === selfId && message.id <= lastItemId
      ? { ...message, read_by_recipient: true }
      : message
  ));
}

function ConversationAvatar({ name, support = false, size = 72 }: { name: string; support?: boolean; size?: number }) {
  const avatarUrl = AVATAR_IMAGES[name];

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, support && styles.supportAvatar]}>
      {support ? (
        <Ionicons name="headset-outline" size={size * 0.42} color={NAVY} />
      ) : avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={[styles.avatarImage, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.26 }]}>{initials(name)}</Text>
      )}
      {!support && <View style={styles.onlineDot} />}
    </View>
  );
}

function ConversationRow({
  conversation,
  pinned,
  border,
  userRole,
  onPress,
}: {
  conversation: Conversation;
  pinned?: boolean;
  border?: boolean;
  userRole?: string;
  onPress: () => void;
}) {
  const unread = conversation.unread_count ?? 0;
  const support = isSupportConversation(conversation);
  const subjectLabel = counterpartRoleLabel(conversation, userRole);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.conversationRow, border && styles.rowBorder, pressed && styles.pressed]}>
      <ConversationAvatar name={conversation.counterpart} support={support} />
      <View style={styles.conversationCopy}>
        <View style={styles.nameLine}>
          <Text style={styles.conversationName} numberOfLines={1}>{conversation.counterpart}</Text>
          <Ionicons name="checkmark-circle" size={20} color="#2479E9" />
        </View>
        <Text style={styles.conversationSubject} numberOfLines={1}>{subjectLabel}</Text>
        <Text style={styles.conversationLast} numberOfLines={1}>{conversation.last_message ?? "Your lesson conversation starts here."}</Text>
        {pinned && (
          <View style={styles.lessonMeta}>
            <Ionicons name="calendar-outline" size={17} color={NAVY} />
            <Text style={styles.lessonMetaText} numberOfLines={1}>Lesson {new Date(conversation.scheduled_at).toDateString() === new Date().toDateString() ? "today" : "scheduled"} · {formatTime(conversation.scheduled_at)}</Text>
          </View>
        )}
      </View>
      <View style={styles.conversationRight}>
        <Text style={styles.conversationTime}>{relativeStamp(conversation.last_message_at ?? conversation.scheduled_at)}</Text>
        {!!unread && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        )}
        {pinned && <Ionicons name="pin" size={21} color={MUTED_NAVY} />}
        {!unread && !pinned && <Ionicons name="checkmark-done" size={22} color="#0D7DFF" />}
      </View>
    </Pressable>
  );
}

function AttachmentCard({
  itemId,
  filename,
  mediaType,
  size,
}: {
  itemId: number;
  filename: string;
  mediaType: string;
  size: number;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const { data } = await apiClient.get(`/learning/files/${itemId}`, { responseType: "arraybuffer", timeout: 60000 });
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([data], { type: mediaType }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
        const file = new FsFile(Paths.cache, filename);
        try {
          file.write(new Uint8Array(data));
          await Sharing.shareAsync(file.uri, { mimeType: mediaType });
        } finally {
          if (file.exists) file.delete();
        }
      }
    } catch {
      Alert.alert("Download failed", "Could not download this document.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.fileCard}>
      <View style={styles.pdfIcon}>
        <Ionicons name="document-text-outline" size={30} color="#C91D24" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fileName} numberOfLines={1}>{filename}</Text>
        <Text style={styles.fileMeta}>{mediaType.includes("pdf") ? "PDF" : "File"} · {(size / (1024 * 1024)).toFixed(1)} MB</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={download} disabled={busy} style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color={NAVY} /> : <Ionicons name="download-outline" size={27} color={NAVY} />}
      </Pressable>
    </View>
  );
}

function MessageBubble({
  message,
  mine,
  peerName,
  onReply,
  onReact,
}: {
  message: LearningItem;
  mine: boolean;
  peerName: string;
  onReply: () => void;
  onReact: (emoji: string) => void;
}) {
  const showText = !message.attachment || !message.body.startsWith("Shared ");
  const attachmentOnly = !!message.attachment && !showText;

  return (
    <View style={[styles.messageLine, mine && styles.messageLineMine]}>
      {!mine && <ConversationAvatar name={peerName} size={38} />}
      <View style={[styles.messageStack, mine && styles.messageStackMine]}>
        <Pressable accessibilityRole="button" onPress={onReply} onLongPress={onReply} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, attachmentOnly && styles.attachmentBubble]}>
          {!!message.reply_to && (
            <View style={[styles.replyPreview, mine && styles.replyPreviewMine]}>
              <Text style={[styles.replyAuthor, mine && styles.replyAuthorMine]} numberOfLines={1}>{message.reply_to.author_name}</Text>
              <Text style={[styles.replyText, mine && styles.replyTextMine]} numberOfLines={2}>{message.reply_to.body}</Text>
            </View>
          )}
          {showText && <Text selectable style={[styles.messageText, mine && styles.messageTextMine]}>{message.body}</Text>}
          {message.attachment && (
            <AttachmentCard
              itemId={message.id}
              filename={message.title || message.attachment.filename}
              mediaType={message.attachment.media_type}
              size={message.attachment.size}
            />
          )}
        </Pressable>
        <View style={[styles.bubbleMetaRow, mine && styles.bubbleMetaRowMine]}>
          <Text style={[styles.bubbleTime, message.failed && styles.failedText]}>
            {message.failed ? "Not sent" : message.pending ? "Sending" : formatTime(message.created_at)}
          </Text>
          {mine && !message.failed && <Ionicons name={message.pending ? "time-outline" : "checkmark-done"} size={17} color={message.pending ? MUTED_NAVY : "#0D7DFF"} />}
        </View>
        {!!message.reactions?.length && (
          <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
            {message.reactions.map(reaction => (
              <Pressable
                key={reaction.emoji}
                accessibilityRole="button"
                onPress={() => onReact(reaction.emoji)}
                style={[styles.reactionChip, reaction.mine && styles.reactionChipMine]}
              >
                <Text style={styles.reactionText}>{reaction.emoji} {reaction.count}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function EmptyMessagesMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.emptyIllustration, compact && styles.emptyIllustrationCompact]}>
      <Ionicons name="chatbubble-outline" size={compact ? 74 : 96} color={NAVY} />
      <View style={[styles.emptyBook, compact && styles.emptyBookCompact]}>
        <Ionicons name="book-outline" size={compact ? 26 : 34} color={NAVY} />
      </View>
    </View>
  );
}

function EmptyInbox({ userRole }: { userRole?: string }) {
  const tutor = userRole === "tutor";

  return (
    <View style={styles.emptyInbox}>
      <EmptyMessagesMark />
      <Text style={styles.emptyInboxTitle}>No messages yet</Text>
      <Text style={styles.emptyInboxText}>
        {tutor
          ? "Start a conversation with a student to answer questions, share assignments and prepare for lessons."
          : "Start a conversation with a tutor to ask questions, share assignments and prepare for your lessons."}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => router.push(tutor ? "/(tutor)/students" : "/(tabs)/search")} style={({ pressed }) => [styles.findTutorButton, pressed && styles.pressed]}>
        <Ionicons name="search-outline" size={28} color="#FFFFFF" />
        <Text style={styles.findTutorText}>{tutor ? "View students" : "Find a tutor"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push("/help")} style={({ pressed }) => [styles.supportLink, pressed && styles.pressed]}>
        <Ionicons name="headset-outline" size={28} color={NAVY} />
        <Text style={styles.supportText}>Contact support</Text>
      </Pressable>
      <View style={styles.confidenceBlock}>
        <Text style={styles.confidenceTitle}>Chat with confidence</Text>
        <View style={styles.confidenceCard}>
          <View style={styles.confidenceRow}>
            <Ionicons name="shield-checkmark-outline" size={30} color={NAVY} />
            <Text style={styles.confidenceText}>Verified tutors only</Text>
          </View>
          <View style={styles.confidenceDivider} />
          <View style={styles.confidenceRow}>
            <Ionicons name="attach-outline" size={30} color={NAVY} />
            <Text style={styles.confidenceText}>Share notes and assignments</Text>
          </View>
          <View style={styles.confidenceDivider} />
          <View style={styles.confidenceRow}>
            <Ionicons name="calendar-outline" size={30} color={NAVY} />
            <Text style={styles.confidenceText}>Keep lesson context together</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore(state => state.user);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<LearningItem[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<LearningItem | null>(null);
  const [typingUser, setTypingUser] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReadSent = useRef(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const messagesRef = useRef<LearningItem[]>([]);
  const userRole = user?.role;

  const loadConversations = useCallback(async () => {
    try {
      const rows = await getConversations();
      setConversations(rows);
      setError("");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load messages."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadThread = useCallback(async (conversation: Conversation) => {
    setThreadLoading(true);
    try {
      const rows = await getConversationMessages(conversation.booking_id);
      setMessages(rows);
      const last = rows.at(-1);
      if (last) {
        lastReadSent.current = last.id;
        await markConversationRead(conversation.booking_id, last.id).catch(() => undefined);
      }
      setConversations(current => current.map(item => (
        item.booking_id === conversation.booking_id ? { ...item, unread_count: 0, last_read_item_id: last?.id ?? item.last_read_item_id } : item
      )));
      setError("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not open this conversation."));
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let closed = false;
    let reconnectAttempt = 0;

    const connect = () => {
      void createMessageSocket(active.booking_id).then(socket => {
        if (closed) {
          socket.close();
          return;
        }
        socketRef.current = socket;
        socket.onopen = () => {
          reconnectAttempt = 0;
        };
        socket.onmessage = event => {
          try {
            const payload = JSON.parse(String(event.data));
            if ((payload.type === "message" || payload.type === "reaction") && payload.message) {
              const incoming = payload.message as LearningItem;
              setMessages(current => mergeMessage(current, incoming));
              if (payload.type === "message") {
                setConversations(current => applyConversationMessage(current, incoming, active.booking_id, user?.id));
              }
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
            }
            if (payload.type === "typing" && payload.user_id !== user?.id) {
              setTypingUser(payload.is_typing ? payload.user_id : null);
            }
            if (payload.type === "read") {
              const readerId = Number(payload.user_id);
              const lastItemId = Number(payload.last_item_id);
              setMessages(current => applyReadReceipt(current, readerId, lastItemId, user?.id));
              if (readerId === user?.id) {
                setConversations(current => current.map(item => (
                  item.booking_id === active.booking_id ? { ...item, unread_count: 0, last_read_item_id: lastItemId } : item
                )));
              }
            }
          } catch {
            // Ignore malformed socket frames.
          }
        };
        socket.onclose = event => {
          if (socketRef.current === socket) socketRef.current = null;
          setTypingUser(null);
          if (closed) return;
          if (event.code === 1008) {
            setError("This conversation is no longer available.");
            return;
          }
          reconnectAttempt += 1;
          const delay = Math.min(1000 * reconnectAttempt, 5000);
          reconnectTimer.current = setTimeout(connect, delay);
        };
      }).catch(() => {
        socketRef.current = null;
        if (!closed) {
          reconnectAttempt += 1;
          reconnectTimer.current = setTimeout(connect, Math.min(1000 * reconnectAttempt, 5000));
        }
      });
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [active, user?.id]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const activeBookingId = active.booking_id;
    const intervalMs = 2500;

    async function pollThread() {
      const after = messagesRef.current.reduce((max, message) => message.id > 0 ? Math.max(max, message.id) : max, 0);
      try {
        const rows = await getConversationMessages(activeBookingId, after);
        if (stopped || rows.length === 0) return;
        const latest = rows[rows.length - 1];
        setMessages(current => rows.reduce((next, row) => mergeMessage(next, row), current));
        setConversations(current => applyConversationMessage(current, latest, activeBookingId, user?.id));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      } catch {
        // Polling is a quiet fallback; visible send/load errors are handled elsewhere.
      }
    }

    const timer = setInterval(() => {
      void pollThread();
    }, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, user?.id]);

  useEffect(() => {
    if (active) return;
    const timer = setInterval(() => {
      void loadConversations();
    }, 8000);
    return () => clearInterval(timer);
  }, [active, loadConversations]);

  useEffect(() => {
    if (!active) return;
    const last = messages.at(-1);
    if (!last) return;
    if (last.id <= lastReadSent.current) return;
    lastReadSent.current = last.id;
    setConversations(current => current.map(item => (
      item.booking_id === active.booking_id ? { ...item, unread_count: 0, last_read_item_id: last.id } : item
    )));
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "read", last_item_id: last.id }));
    } else {
      void markConversationRead(active.booking_id, last.id).catch(() => undefined);
    }
  }, [active, messages]);

  const filteredConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(item => {
      const matchesSearch = !q || `${item.counterpart} ${item.title} ${item.last_message ?? ""}`.toLowerCase().includes(q);
      const matchesFilter = filter === "all"
        || (filter === "unread" && !!item.unread_count)
        || (filter === "tutors" && item.title.toLowerCase() !== "support")
        || (filter === "support" && item.title.toLowerCase().includes("support"));
      return matchesSearch && matchesFilter;
    });
  }, [conversations, filter, query]);

  const pinned = useMemo(() => {
    const unread = filteredConversations.filter(item => !!item.unread_count).slice(0, 2);
    return unread.length ? unread : filteredConversations.slice(0, Math.min(2, filteredConversations.length));
  }, [filteredConversations]);
  const pinnedIds = new Set(pinned.map(item => item.booking_id));
  const recent = filteredConversations.filter(item => !pinnedIds.has(item.booking_id));
  const unreadTotal = conversations.reduce((sum, item) => sum + (item.unread_count ?? 0), 0);

  async function openConversation(conversation: Conversation) {
    setActive(conversation);
    setReplyTo(null);
    lastReadSent.current = 0;
    await loadThread(conversation);
  }

  async function sendMessage() {
    if (!active || !draft.trim()) return;
    const body = draft.trim();
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const replyToId = replyTo && replyTo.id > 0 ? replyTo.id : undefined;
    const replyPreview = replyTo ? {
      id: replyTo.id,
      author_id: replyTo.author_id,
      author_name: replyTo.author_name,
      body: replyTo.body,
      kind: replyTo.kind,
    } : null;
    const optimistic: LearningItem = {
      id: -Number(clientId.split("-")[0]),
      booking_id: active.booking_id,
      author_id: user?.id ?? 0,
      author_name: authorName(user),
      kind: "message",
      title: "",
      body,
      url: null,
      due_at: null,
      client_id: clientId,
      created_at: new Date().toISOString(),
      submission: null,
      read_by_recipient: false,
      reply_to_item_id: replyToId,
      reply_to: replyPreview,
      reactions: [],
      attachment: null,
      extra: {},
      pending: true,
    };
    setDraft("");
    setReplyTo(null);
    setMessages(current => mergeMessage(current, optimistic));
    setConversations(current => applyConversationMessage(current, optimistic, active.booking_id, user?.id));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    setSending(true);
    setError("");
    try {
      const sent = confirmedMessage(
        await sendConversationMessage(active.booking_id, { body, client_id: clientId, reply_to_item_id: replyToId }),
        optimistic,
      );
      setMessages(current => mergeMessage(current, sent));
      setConversations(current => applyConversationMessage(current, sent, active.booking_id, user?.id));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err) {
      if (shouldMarkSendFailed(err)) {
        setMessages(current => current.map(message => message.client_id === clientId ? { ...message, pending: false, failed: true } : message));
        setError(extractErrorMessage(err, "Could not send your message."));
      }
    } finally {
      setSending(false);
    }
  }

  async function attachDocument() {
    if (!active) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 8 * 1024 * 1024) {
        Alert.alert("File too large", "Choose a file no larger than 8 MB.");
        return;
      }
      setSending(true);
      const uploaded = await uploadMessageAttachment(active.booking_id, {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        file: asset.file,
      }, replyTo?.id);
      setMessages(current => mergeMessage(current, uploaded));
      setConversations(current => applyConversationMessage(current, uploaded, active.booking_id, user?.id));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      setReplyTo(null);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not upload this document."));
    } finally {
      setSending(false);
    }
  }

  async function toggleReaction(message: LearningItem, emoji: string) {
    if (!active) return;
    try {
      const updated = await reactToMessage(active.booking_id, message.id, emoji);
      setMessages(current => mergeMessage(current, updated));
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update reaction."));
    }
  }

  function handleDraftChange(text: string) {
    setDraft(text);
    if (!active || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "typing", is_typing: true }));
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.send(JSON.stringify({ type: "typing", is_typing: false }));
    }, 1200);
  }

  const refreshing = loading || threadLoading;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {!!error && (
          <Pressable accessibilityRole="button" onPress={() => setError("")} style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        )}

        {!active ? (
          <>
            <View style={styles.inboxHeader}>
              <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.plainBack}>
                <Ionicons name="chevron-back" size={32} color={NAVY} />
              </Pressable>
              <View style={styles.inboxTitleWrap}>
                <Text style={styles.inboxTitle}>Messages</Text>
                <Text style={styles.inboxSubtitle}>{unreadTotal ? `${unreadTotal} unread` : "Your conversations"}</Text>
              </View>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadConversations} tintColor={Colors.teal} colors={[Colors.teal]} />}
              contentContainerStyle={[styles.inboxContent, { paddingBottom: Math.max(insets.bottom, 18) + 30 }]}
            >
              {loading ? <ActivityIndicator color={Colors.teal} /> : conversations.length === 0 ? (
                <EmptyInbox userRole={userRole} />
              ) : filteredConversations.length === 0 ? (
                <>
                  <View style={styles.searchBar}>
                    <Ionicons name="search-outline" size={29} color={NAVY} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search conversations"
                      placeholderTextColor={MUTED_NAVY}
                      style={styles.searchInput}
                    />
                    <Ionicons name="options-outline" size={28} color={NAVY} />
                  </View>
                  <View style={styles.filterRow}>
                    {([
                      ["all", "All"],
                      ["unread", "Unread"],
                      ["tutors", userRole === "tutor" ? "Students" : "Tutors"],
                      ["support", "Support"],
                    ] as const).map(([key, label]) => (
                      <Pressable key={key} accessibilityRole="button" onPress={() => setFilter(key)} style={[styles.filterChip, filter === key && styles.filterChipActive]}>
                        <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.emptyCard}>
                    <Ionicons name="search-outline" size={34} color={MUTED_NAVY} />
                    <Text style={styles.emptyTitle}>No matching conversations</Text>
                    <Text style={styles.emptyText}>Try a different search or filter.</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.searchBar}>
                    <Ionicons name="search-outline" size={29} color={NAVY} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search conversations"
                      placeholderTextColor={MUTED_NAVY}
                      style={styles.searchInput}
                    />
                    <Ionicons name="options-outline" size={28} color={NAVY} />
                  </View>
                  <View style={styles.filterRow}>
                    {([
                      ["all", "All"],
                      ["unread", "Unread"],
                      ["tutors", userRole === "tutor" ? "Students" : "Tutors"],
                      ["support", "Support"],
                    ] as const).map(([key, label]) => (
                      <Pressable key={key} accessibilityRole="button" onPress={() => setFilter(key)} style={[styles.filterChip, filter === key && styles.filterChipActive]}>
                        <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Pinned</Text>
                    <Text style={styles.editText}>Edit</Text>
                  </View>
                  {pinned.map((conversation, index) => (
                    <ConversationRow
                      key={conversation.booking_id}
                      conversation={conversation}
                      pinned
                      border={index < pinned.length - 1}
                      userRole={userRole}
                      onPress={() => void openConversation(conversation)}
                    />
                  ))}

                  <Text style={[styles.sectionTitle, styles.recentTitle]}>Recent</Text>
                  {recent.map((conversation, index) => (
                    <ConversationRow
                      key={conversation.booking_id}
                      conversation={conversation}
                      border={index < recent.length - 1}
                      userRole={userRole}
                      onPress={() => void openConversation(conversation)}
                    />
                  ))}

                  <Pressable accessibilityRole="button" style={styles.archivedRow}>
                    <Ionicons name="archive-outline" size={28} color={NAVY} />
                    <Text style={styles.archivedText}>Archived conversations</Text>
                    <Text style={styles.archivedCount}>0</Text>
                    <Ionicons name="chevron-forward" size={23} color={NAVY} />
                  </Pressable>
                </>
              )}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.threadHeader}>
              <Pressable accessibilityRole="button" onPress={() => setActive(null)} style={styles.threadBack}>
                <Ionicons name="chevron-back" size={33} color={NAVY} />
              </Pressable>
              <ConversationAvatar name={active.counterpart} support={isSupportConversation(active)} size={56} />
              <View style={styles.threadNameBlock}>
                <View style={styles.threadNameLine}>
                  <Text style={styles.threadName} numberOfLines={1}>{active.counterpart}</Text>
                  <Ionicons name="checkmark-circle" size={21} color="#2479E9" />
                </View>
                <Text style={styles.threadSubtitle} numberOfLines={1}>{counterpartRoleLabel(active, userRole)}</Text>
              </View>
            </View>

            <View style={styles.lessonBanner}>
              <View style={styles.lessonAccent} />
              <View style={styles.lessonIcon}>
                <Ionicons name="calendar-outline" size={26} color={NAVY} />
              </View>
              <View style={styles.lessonCopy}>
                <Text style={styles.lessonKicker}>Upcoming lesson</Text>
                <Text style={styles.lessonTitle} numberOfLines={1}>{lessonTitleLabel(active)} · {lessonDateLabel(active.scheduled_at)}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => router.push(`/learning/${active.booking_id}` as any)} style={styles.viewLesson}>
                <Text style={styles.viewLessonText}>View lesson</Text>
                <Ionicons name="chevron-forward" size={22} color={NAVY} />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={threadLoading} onRefresh={() => loadThread(active)} tintColor={Colors.teal} colors={[Colors.teal]} />}
              contentContainerStyle={styles.threadContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              <Text style={styles.todayLabel}>Today</Text>
              {threadLoading ? <ActivityIndicator color={Colors.teal} /> : messages.length === 0 ? (
                <View style={styles.emptyThread}>
                  <EmptyMessagesMark compact />
                  <Text style={styles.emptyInboxTitle}>No messages yet</Text>
                  <Text style={styles.emptyInboxText}>Start this conversation to ask questions, share assignments and prepare for your lesson.</Text>
                </View>
              ) : messages.map(message => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  mine={message.author_id === user?.id}
                  peerName={active.counterpart}
                  onReply={() => setReplyTo(message)}
                  onReact={emoji => void toggleReaction(message, emoji)}
                />
              ))}
              {!!typingUser && <Text style={styles.typingText}>Typing…</Text>}
            </ScrollView>

            <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
              {replyTo && (
                <View style={styles.replyingBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.replyingLabel}>Replying to {replyTo.author_name}</Text>
                    <Text style={styles.replyingText} numberOfLines={1}>{replyTo.body}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => setReplyTo(null)} hitSlop={8}>
                    <Ionicons name="close" size={20} color={NAVY} />
                  </Pressable>
                </View>
              )}
              <View style={styles.composer}>
                <Pressable accessibilityRole="button" onPress={attachDocument} disabled={sending} style={({ pressed }) => [styles.plusButton, pressed && styles.pressed, sending && styles.disabled]}>
                  <Ionicons name="add" size={28} color="#FFFFFF" />
                </Pressable>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={draft}
                    onChangeText={handleDraftChange}
                    placeholder={`Message ${active.counterpart.split(" ")[0] ?? ""}`}
                    placeholderTextColor={MUTED_NAVY}
                    multiline
                    style={[styles.input, Platform.OS === "web" && ({ outlineStyle: "none" } as any)]}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={sendMessage}
                  disabled={sending || !draft.trim()}
                  style={({ pressed }) => [styles.sendButton, pressed && styles.pressed, (sending || !draft.trim()) && styles.disabled]}
                >
                  {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={21} color="#FFFFFF" />}
                </Pressable>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  keyboard: { flex: 1 },
  inboxHeader: {
    width: "100%",
    maxWidth: 470,
    minHeight: 104,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  plainBack: { marginRight: 2 },
  inboxTitleWrap: { flex: 1, minWidth: 0 },
  inboxTitle: { fontFamily: "sans-bold", fontSize: 31, lineHeight: 36, color: NAVY },
  inboxSubtitle: { marginTop: 2, fontFamily: "sans-medium", fontSize: 15, color: MUTED_NAVY },
  inboxContent: {
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  searchBar: {
    minHeight: 58,
    borderRadius: 19,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F0F2F6",
  },
  searchInput: { flex: 1, fontFamily: "sans-medium", fontSize: 17, color: NAVY },
  filterRow: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 28 },
  filterChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "#F0F2F6",
  },
  filterChipActive: { backgroundColor: NAVY },
  filterText: { fontFamily: "sans-medium", fontSize: 16, color: MUTED_NAVY },
  filterTextActive: { color: "#FFFFFF" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: "sans-bold", fontSize: 18, color: MUTED_NAVY },
  editText: { fontFamily: "sans-semibold", fontSize: 15, color: "#0D63F3" },
  recentTitle: { marginTop: 30, marginBottom: 12 },
  conversationRow: { minHeight: 118, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: DIVIDER },
  avatar: { alignItems: "center", justifyContent: "center", backgroundColor: NAVY, overflow: "visible" },
  avatarImage: { backgroundColor: "#E8EBF0" },
  supportAvatar: { backgroundColor: SOFT_MINT },
  avatarText: { fontFamily: "sans-bold", color: "#FFFFFF" },
  onlineDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#18C86F",
  },
  conversationCopy: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  conversationName: { flex: 1, fontFamily: "sans-bold", fontSize: 18, color: NAVY },
  conversationSubject: { marginTop: 4, fontFamily: "sans-medium", fontSize: 14, color: MUTED_NAVY },
  conversationLast: { marginTop: 7, fontFamily: "sans-medium", fontSize: 15, color: NAVY },
  lessonMeta: { marginTop: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  lessonMetaText: { flex: 1, fontFamily: "sans-medium", fontSize: 13, color: MUTED_NAVY },
  conversationRight: { width: 58, minHeight: 88, alignItems: "flex-end", justifyContent: "space-between" },
  conversationTime: { fontFamily: "sans-medium", fontSize: 13, color: MUTED_NAVY },
  unreadBadge: { minWidth: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: LIME },
  unreadText: { fontFamily: "sans-bold", fontSize: 13, color: NAVY },
  archivedRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: DIVIDER,
  },
  archivedText: { flex: 1, fontFamily: "sans-medium", fontSize: 17, color: NAVY },
  archivedCount: { fontFamily: "sans-medium", fontSize: 17, color: MUTED_NAVY },
  threadHeader: {
    width: "100%",
    maxWidth: 470,
    minHeight: 96,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  threadBack: { marginRight: -4 },
  threadNameBlock: { flex: 1, minWidth: 0 },
  threadNameLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  threadName: { flex: 1, fontFamily: "sans-bold", fontSize: 20, color: NAVY },
  threadSubtitle: { marginTop: 4, fontFamily: "sans-medium", fontSize: 14, color: MUTED_NAVY },
  lessonBanner: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: SOFT_MINT,
    paddingHorizontal: 18,
  },
  lessonAccent: { position: "absolute", left: 10, top: 20, bottom: 10, width: 4, borderRadius: 2, backgroundColor: LIME },
  lessonIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginLeft: 12, backgroundColor: "#C6F7EE" },
  lessonCopy: { flex: 1, minWidth: 0 },
  lessonKicker: { textTransform: "uppercase", fontFamily: "sans-bold", fontSize: 12, color: MUTED_NAVY },
  lessonTitle: { marginTop: 5, fontFamily: "sans-bold", fontSize: 16, color: NAVY },
  viewLesson: { flexDirection: "row", alignItems: "center", gap: 6 },
  viewLessonText: { fontFamily: "sans-semibold", fontSize: 15, color: "#0D63F3" },
  threadContent: { width: "100%", maxWidth: 470, alignSelf: "center", paddingHorizontal: 14, paddingTop: 22, paddingBottom: 20 },
  todayLabel: { alignSelf: "center", marginBottom: 22, fontFamily: "sans-semibold", fontSize: 14, color: MUTED_NAVY },
  messageLine: { flexDirection: "row", alignItems: "flex-end", gap: 9, marginBottom: 18 },
  messageLineMine: { justifyContent: "flex-end" },
  messageStack: { maxWidth: "80%" },
  messageStackMine: { alignItems: "flex-end" },
  bubble: { borderRadius: 17, paddingHorizontal: 15, paddingVertical: 12 },
  bubbleMine: { borderBottomRightRadius: 3, backgroundColor: NAVY },
  bubbleOther: { borderBottomLeftRadius: 3, backgroundColor: "#F0F3F8" },
  attachmentBubble: { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: "transparent" },
  messageText: { fontFamily: "sans-medium", fontSize: 16, lineHeight: 23, color: NAVY },
  messageTextMine: { color: "#FFFFFF" },
  bubbleMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  bubbleMetaRowMine: { justifyContent: "flex-end" },
  bubbleTime: { fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  failedText: { color: Colors.destructive },
  replyPreview: { borderLeftWidth: 3, borderLeftColor: Colors.teal, paddingLeft: 9, marginBottom: 8 },
  replyPreviewMine: { borderLeftColor: LIME },
  replyAuthor: { fontFamily: "sans-bold", fontSize: 12, color: NAVY },
  replyAuthorMine: { color: "#FFFFFF" },
  replyText: { marginTop: 2, fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  replyTextMine: { color: "#C9D8EC" },
  fileCard: {
    minHeight: 76,
    minWidth: 260,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE1EA",
  },
  pdfIcon: { width: 46, height: 46, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FCE8E8" },
  fileName: { fontFamily: "sans-bold", fontSize: 14, color: NAVY },
  fileMeta: { marginTop: 4, fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  downloadButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF2F7" },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  reactionRowMine: { justifyContent: "flex-end" },
  reactionChip: { minHeight: 26, borderRadius: 13, paddingHorizontal: 8, justifyContent: "center", backgroundColor: "#EDF2F8" },
  reactionChipMine: { backgroundColor: LIME },
  reactionText: { fontFamily: "sans-semibold", fontSize: 12, color: NAVY },
  typingText: { marginLeft: 8, fontFamily: "sans-medium", fontSize: 13, color: MUTED_NAVY },
  composerWrap: {
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: DIVIDER,
    backgroundColor: "#FFFFFF",
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
    elevation: 8,
  },
  replyingBox: { minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, marginBottom: 8, backgroundColor: SOFT_MINT },
  replyingLabel: { fontFamily: "sans-bold", fontSize: 12, color: NAVY },
  replyingText: { marginTop: 2, fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  composer: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 6 },
  plusButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: NAVY },
  inputWrap: { flex: 1, minHeight: 44, maxHeight: 88, borderRadius: 22, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, backgroundColor: "#F3F5F8", borderWidth: 1, borderColor: "#DADDE7" },
  input: { flex: 1, maxHeight: 72, fontFamily: "sans-medium", fontSize: 14, color: NAVY, paddingVertical: 5 },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: NAVY },
  emptyCard: { minHeight: 180, borderRadius: 20, borderTopRightRadius: 2, borderBottomLeftRadius: 2, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1DFDA" },
  emptyTitle: { marginTop: 12, fontFamily: "sans-bold", fontSize: 18, color: NAVY },
  emptyText: { marginTop: 8, textAlign: "center", fontFamily: "sans-medium", fontSize: 13, lineHeight: 19, color: MUTED_NAVY },
  emptyInbox: {
    alignItems: "center",
    paddingTop: 64,
  },
  emptyIllustration: {
    width: 190,
    height: 190,
    borderRadius: 95,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SOFT_MINT,
  },
  emptyIllustrationCompact: { width: 150, height: 150, borderRadius: 75 },
  emptyBook: {
    position: "absolute",
    width: 58,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SOFT_MINT,
  },
  emptyBookCompact: { width: 46, height: 38, borderRadius: 14 },
  emptyThread: { alignItems: "center", paddingTop: 36, paddingHorizontal: 18 },
  emptyInboxTitle: {
    marginTop: 36,
    fontFamily: "sans-bold",
    fontSize: 30,
    lineHeight: 36,
    textAlign: "center",
    color: NAVY,
  },
  emptyInboxText: {
    maxWidth: 330,
    marginTop: 14,
    textAlign: "center",
    fontFamily: "sans-medium",
    fontSize: 17,
    lineHeight: 25,
    color: MUTED_NAVY,
  },
  findTutorButton: {
    width: "84%",
    minHeight: 58,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginTop: 34,
    backgroundColor: NAVY,
  },
  findTutorText: {
    fontFamily: "sans-bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  supportLink: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 22,
  },
  supportText: {
    fontFamily: "sans-medium",
    fontSize: 18,
    color: NAVY,
  },
  confidenceBlock: {
    alignSelf: "stretch",
    marginTop: 50,
  },
  confidenceTitle: {
    fontFamily: "sans-bold",
    fontSize: 21,
    color: NAVY,
  },
  confidenceCard: {
    marginTop: 18,
    borderRadius: 18,
    paddingHorizontal: 18,
    backgroundColor: "#F0F2F6",
  },
  confidenceRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },
  confidenceText: {
    flex: 1,
    fontFamily: "sans-medium",
    fontSize: 16,
    color: MUTED_NAVY,
  },
  confidenceDivider: {
    height: 1,
    backgroundColor: DIVIDER,
  },
  error: { width: "100%", maxWidth: 470, alignSelf: "center", marginTop: 10, borderRadius: 14, padding: 12, backgroundColor: "#FFECEA" },
  errorText: { fontFamily: "sans-semibold", fontSize: 13, color: Colors.destructive },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
