import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  PanResponder,
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
import { LoadingState } from "@/components/ui/Motion";
import { extractErrorMessage } from "@/lib/api/auth";
import { apiClient } from "@/lib/api/client";
import {
  createMessageSocket,
  deleteConversationMessage,
  editConversationMessage,
  getConversationMessages,
  getConversations,
  markConversationDelivered,
  markConversationRead,
  reactToMessage,
  sendConversationMessage,
  uploadMessageAttachment,
  type Conversation,
  type LearningItem,
} from "@/lib/api/learning";
import { useAuthStore } from "@/lib/store/auth";
import { setActiveConversationBookingId } from "@/lib/store/chatPresence";

const NAVY = "#071D3A";
const LIME = "#BFFF4B";
const MUTED_NAVY = "#66718E";
const SOFT_MINT = "#D3FAF3";
const DIVIDER = "#DADDE7";
const MAX_CHAT_FILE_BYTES = 200 * 1024 * 1024;
const MAX_CHAT_FILE_SIZE_LABEL = "200 MB";
const MAX_CHAT_ATTACHMENTS = 20;
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
type PendingAttachment = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  file?: File;
};
type SendPlan = {
  clientId: string;
  bookingId: number;
  attachment: PendingAttachment | null;
  optimistic: LearningItem;
  replyToId?: number;
};

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

function formatFileSize(size?: number | null) {
  if (!size) return "Ready to send";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKindLabel(mediaType?: string | null, filename = "") {
  const extension = filename.split(".").pop()?.toUpperCase();
  if (mediaType?.includes("pdf")) return "PDF";
  if (mediaType?.startsWith("image/")) return "Image";
  return extension || "File";
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
  if (message.extra?.deleted_at) return "This message was deleted";
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

function isDefinitiveMutationFailure(err: any) {
  const status = err?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500 && ![408, 429].includes(status);
}

function isDeletedMessage(message: LearningItem) {
  return !!message.extra?.deleted_at;
}

function isEditedMessage(message: LearningItem) {
  return !!message.extra?.edited_at && !isDeletedMessage(message);
}

function messageActionKey(message: LearningItem) {
  return message.client_id ?? String(message.id);
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
      ? { ...message, delivered_by_recipient: true, read_by_recipient: true }
      : message
  ));
}

function applyDeliveryReceipt(list: LearningItem[], readerId: number, lastItemId: number, selfId?: number) {
  if (readerId === selfId) return list;
  return list.map(message => (
    message.author_id === selfId && message.id <= lastItemId
      ? { ...message, delivered_by_recipient: true }
      : message
  ));
}

function MessageStatusTicks({ message }: { message: LearningItem }) {
  if (message.pending) return <Ionicons name="time-outline" size={17} color={MUTED_NAVY} />;
  if (message.read_by_recipient) return <Ionicons name="checkmark-done" size={17} color="#0D7DFF" />;
  if (message.delivered_by_recipient) return <Ionicons name="checkmark-done" size={17} color={MUTED_NAVY} />;
  return <Ionicons name="checkmark" size={17} color={MUTED_NAVY} />;
}

function ConversationAvatar({ name, support = false, size = 61 }: { name: string; support?: boolean; size?: number }) {
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
  pending,
  failed,
}: {
  itemId: number;
  filename: string;
  mediaType: string;
  size: number;
  pending?: boolean;
  failed?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (pending || failed || itemId < 1) return;
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
        <Ionicons name={mediaType.startsWith("image/") ? "image-outline" : "document-text-outline"} size={30} color="#C91D24" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fileName} numberOfLines={1}>{filename}</Text>
        <Text style={styles.fileMeta}>{pending ? "Uploading" : failed ? "Upload failed" : `${fileKindLabel(mediaType, filename)} · ${formatFileSize(size)}`}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={download} disabled={busy || pending || failed || itemId < 1} style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed, (pending || failed || itemId < 1) && styles.disabled]}>
        {busy ? <ActivityIndicator color={NAVY} /> : <Ionicons name={pending ? "time-outline" : "download-outline"} size={27} color={NAVY} />}
      </Pressable>
    </View>
  );
}

function MessageBubble({
  message,
  mine,
  peerName,
  onOpenActions,
  onResend,
  onReply,
  onEdit,
  onDelete,
  onReact,
  actionOpen,
}: {
  message: LearningItem;
  mine: boolean;
  peerName: string;
  onOpenActions: () => void;
  onResend: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  actionOpen: boolean;
}) {
  const deleted = isDeletedMessage(message);
  const showText = deleted || !message.attachment || !message.body.startsWith("Shared ");
  const attachmentOnly = !deleted && !!message.attachment && !showText;

  return (
    <View style={[styles.messageLine, mine && styles.messageLineMine]}>
      {!mine && <ConversationAvatar name={peerName} size={38} />}
      <View style={[styles.messageStack, mine && styles.messageStackMine]}>
        <Pressable accessibilityRole="button" onPress={onOpenActions} onLongPress={onOpenActions} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, attachmentOnly && styles.attachmentBubble]}>
          {!!message.reply_to && !deleted && (
            <View style={[styles.replyPreview, mine && styles.replyPreviewMine]}>
              <Text style={[styles.replyAuthor, mine && styles.replyAuthorMine]} numberOfLines={1}>{message.reply_to.author_name}</Text>
              <Text style={[styles.replyText, mine && styles.replyTextMine]} numberOfLines={2}>{message.reply_to.body}</Text>
            </View>
          )}
          {showText && <Text selectable style={[styles.messageText, mine && styles.messageTextMine, deleted && styles.deletedMessageText]}>{message.body}</Text>}
          {!deleted && message.attachment && (
            <AttachmentCard
              itemId={message.id}
              filename={message.title || message.attachment.filename}
              mediaType={message.attachment.media_type}
              size={message.attachment.size}
              pending={message.pending}
              failed={message.failed}
            />
          )}
        </Pressable>
        <View style={[styles.bubbleMetaRow, mine && styles.bubbleMetaRowMine]}>
          <Text style={[styles.bubbleTime, message.failed && styles.failedText]}>
            {message.failed ? "Not sent" : message.pending ? "Sending" : `${formatTime(message.created_at)}${isEditedMessage(message) ? " · Edited" : ""}`}
          </Text>
          {mine && !message.failed && !isDeletedMessage(message) && <MessageStatusTicks message={message} />}
        </View>
        {mine && message.failed && (
          <View style={styles.failedActions}>
            <Pressable accessibilityRole="button" onPress={onResend} style={({ pressed }) => [styles.failedAction, pressed && styles.pressed]}>
              <Ionicons name="refresh" size={15} color={NAVY} />
              <Text style={styles.failedActionText}>Resend</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onDelete} style={({ pressed }) => [styles.failedAction, pressed && styles.pressed]}>
              <Ionicons name="trash-outline" size={15} color={NAVY} />
              <Text style={styles.failedActionText}>Delete</Text>
            </Pressable>
          </View>
        )}
        {actionOpen && !message.pending && !message.failed && !deleted && (
          <View style={[styles.messageActions, mine && styles.messageActionsMine]}>
            <Pressable accessibilityRole="button" onPress={onReply} style={({ pressed }) => [styles.messageAction, pressed && styles.pressed]}>
              <Ionicons name="return-up-back-outline" size={15} color={NAVY} />
              <Text style={styles.messageActionText}>Reply</Text>
            </Pressable>
            {mine && (
              <Pressable accessibilityRole="button" onPress={onEdit} style={({ pressed }) => [styles.messageAction, pressed && styles.pressed]}>
                <Ionicons name="create-outline" size={15} color={NAVY} />
                <Text style={styles.messageActionText}>Edit</Text>
              </Pressable>
            )}
            {mine && (
              <Pressable accessibilityRole="button" onPress={onDelete} style={({ pressed }) => [styles.messageAction, styles.deleteAction, pressed && styles.pressed]}>
                <Ionicons name="trash-outline" size={15} color={Colors.destructive} />
                <Text style={[styles.messageActionText, styles.deleteActionText]}>Delete</Text>
              </Pressable>
            )}
          </View>
        )}
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

function AttachmentPreview({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove: (index: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.previewRail}
      contentContainerStyle={styles.previewList}
    >
      {attachments.map((attachment, index) => {
        const mediaType = attachment.mimeType ?? "";
        return (
          <View key={`${attachment.uri}-${index}`} style={styles.attachmentPreview}>
            <View style={styles.previewIcon}>
              <Ionicons name={mediaType.startsWith("image/") ? "image-outline" : "document-text-outline"} size={24} color={NAVY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName} numberOfLines={1}>{attachment.name}</Text>
              <Text style={styles.previewMeta}>{fileKindLabel(mediaType, attachment.name)} · {formatFileSize(attachment.size)}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => onRemove(index)} hitSlop={8} style={({ pressed }) => [styles.previewRemove, pressed && styles.pressed]}>
              <Ionicons name="close" size={18} color={NAVY} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
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
  const [editingMessage, setEditingMessage] = useState<LearningItem | null>(null);
  const [actionMessageKey, setActionMessageKey] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
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
  const lastDeliveredSent = useRef(0);
  const lastReadSent = useRef(0);
  const scrollRef = useRef<ScrollView | null>(null);
  const messagesRef = useRef<LearningItem[]>([]);
  const failedSendPlans = useRef<Record<string, SendPlan>>({});
  const pendingFailureTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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

  useEffect(() => () => {
    Object.values(pendingFailureTimers.current).forEach(clearTimeout);
  }, []);

  const loadThread = useCallback(async (conversation: Conversation) => {
    setThreadLoading(true);
    try {
      const rows = await getConversationMessages(conversation.booking_id);
      setMessages(rows);
      const last = rows.at(-1);
      if (last) {
        lastDeliveredSent.current = last.id;
        lastReadSent.current = last.id;
        await markConversationDelivered(conversation.booking_id, last.id).catch(() => undefined);
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
              clearSendTracking(incoming.client_id);
              setMessages(current => mergeMessage(current, incoming));
              if (payload.type === "message") {
                setConversations(current => applyConversationMessage(current, incoming, active.booking_id, user?.id));
              }
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
            }
            if (payload.type === "typing" && payload.user_id !== user?.id) {
              setTypingUser(payload.is_typing ? payload.user_id : null);
            }
            if (payload.type === "error" && payload.detail) {
              setError(String(payload.detail));
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
            if (payload.type === "delivered") {
              const readerId = Number(payload.user_id);
              const lastItemId = Number(payload.last_item_id);
              setMessages(current => applyDeliveryReceipt(current, readerId, lastItemId, user?.id));
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
    let ticks = 0;

    async function pollThread() {
      ticks += 1;
      const fullRefresh = ticks % 6 === 0;
      const after = fullRefresh ? 0 : messagesRef.current.reduce((max, message) => message.id > 0 ? Math.max(max, message.id) : max, 0);
      try {
        const rows = await getConversationMessages(activeBookingId, after);
        if (stopped || rows.length === 0) return;
        const latest = rows[rows.length - 1];
        rows.forEach(row => clearSendTracking(row.client_id));
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
    if (last.id > lastDeliveredSent.current) {
      lastDeliveredSent.current = last.id;
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "delivered", last_item_id: last.id }));
      } else {
        void markConversationDelivered(active.booking_id, last.id).catch(() => undefined);
      }
    }
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

  useEffect(() => {
    setActiveConversationBookingId(active?.booking_id ?? null);
    return () => setActiveConversationBookingId(null);
  }, [active?.booking_id]);

  async function openConversation(conversation: Conversation) {
    setActive(conversation);
    setReplyTo(null);
    setEditingMessage(null);
    setActionMessageKey(null);
    setPendingAttachments([]);
    lastDeliveredSent.current = 0;
    lastReadSent.current = 0;
    await loadThread(conversation);
  }

  const closeConversation = useCallback(() => {
    setActive(null);
    setReplyTo(null);
    setEditingMessage(null);
    setActionMessageKey(null);
    setPendingAttachments([]);
  }, []);

  function clearSendTracking(clientId?: string | null) {
    if (!clientId) return;
    delete failedSendPlans.current[clientId];
    const timer = pendingFailureTimers.current[clientId];
    if (timer) clearTimeout(timer);
    delete pendingFailureTimers.current[clientId];
  }

  function schedulePendingFailure(plan: SendPlan) {
    clearSendTracking(plan.clientId);
    failedSendPlans.current[plan.clientId] = plan;
    pendingFailureTimers.current[plan.clientId] = setTimeout(() => {
      setMessages(current => current.map(message => (
        message.client_id === plan.clientId && message.pending
          ? { ...message, pending: false, failed: true }
          : message
      )));
      delete pendingFailureTimers.current[plan.clientId];
    }, 20000);
  }

  function markPlanFailed(plan: SendPlan) {
    clearSendTracking(plan.clientId);
    failedSendPlans.current[plan.clientId] = plan;
    setMessages(current => current.map(message => (
      message.client_id === plan.clientId ? { ...message, pending: false, failed: true } : message
    )));
  }

  async function deliverPlan(plan: SendPlan) {
    const sentMessage = plan.attachment
      ? await uploadMessageAttachment(plan.bookingId, plan.attachment, { body: plan.optimistic.body, client_id: plan.clientId, reply_to_item_id: plan.replyToId })
      : await sendConversationMessage(plan.bookingId, { body: plan.optimistic.body, client_id: plan.clientId, reply_to_item_id: plan.replyToId });
    const sent = confirmedMessage(sentMessage, plan.optimistic);
    clearSendTracking(sent.client_id ?? plan.clientId);
    setMessages(current => mergeMessage(current, sent));
    setConversations(current => applyConversationMessage(current, sent, plan.bookingId, user?.id));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }

  async function sendMessage() {
    const attachments = pendingAttachments;
    if (editingMessage) {
      if (!active || !draft.trim()) return;
      const body = draft.trim();
      const optimistic: LearningItem = {
        ...editingMessage,
        body,
        extra: { ...(editingMessage.extra ?? {}), edited_at: new Date().toISOString() },
      };
      setDraft("");
      setEditingMessage(null);
      setActionMessageKey(null);
      setMessages(current => mergeMessage(current, optimistic));
      setConversations(current => applyConversationMessage(current, optimistic, active.booking_id, user?.id));
      setSending(true);
      setError("");
      try {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: "edit", item_id: editingMessage.id, body }));
        } else {
          const updated = await editConversationMessage(active.booking_id, editingMessage.id, body);
          setMessages(current => mergeMessage(current, updated));
          setConversations(current => applyConversationMessage(current, updated, active.booking_id, user?.id));
        }
      } catch (err) {
        if (isDefinitiveMutationFailure(err)) {
          setError(extractErrorMessage(err, "Could not edit this message."));
          setMessages(current => mergeMessage(current, editingMessage));
          setDraft(body);
          setEditingMessage(editingMessage);
        }
      } finally {
        setSending(false);
      }
      return;
    }
    if (!active || (!draft.trim() && !attachments.length)) return;
    const caption = draft.trim();
    const replyToId = replyTo && replyTo.id > 0 ? replyTo.id : undefined;
    const replyPreview = replyTo ? {
      id: replyTo.id,
      author_id: replyTo.author_id,
      author_name: replyTo.author_name,
      body: replyTo.body,
      kind: replyTo.kind,
    } : null;
    const stamp = Date.now();
    const plans: SendPlan[] = attachments.length
      ? attachments.map((attachment, index) => {
        const clientId = `${stamp}-${index}-${Math.random().toString(36).slice(2)}`;
        const body = index === 0 && caption ? caption : `Shared ${attachment.name}`;
        return {
          clientId,
          bookingId: active.booking_id,
          attachment,
          replyToId,
          optimistic: {
            id: -(stamp + index),
            booking_id: active.booking_id,
            author_id: user?.id ?? 0,
            author_name: authorName(user),
            kind: "message" as const,
            title: attachment.name,
            body,
            url: null,
            due_at: null,
            client_id: clientId,
            created_at: new Date(stamp + index).toISOString(),
            submission: null,
            read_by_recipient: false,
            reply_to_item_id: replyToId,
            reply_to: replyPreview,
            reactions: [],
            attachment: {
              filename: attachment.name,
              media_type: attachment.mimeType ?? "application/octet-stream",
              size: attachment.size ?? 0,
            },
            extra: {},
            pending: true,
          },
        };
      })
      : (() => {
        const clientId = `${stamp}-0-${Math.random().toString(36).slice(2)}`;
        return [{
          clientId,
          bookingId: active.booking_id,
          attachment: null,
          replyToId,
          optimistic: {
            id: -stamp,
            booking_id: active.booking_id,
            author_id: user?.id ?? 0,
            author_name: authorName(user),
            kind: "message" as const,
            title: "",
            body: caption,
            url: null,
            due_at: null,
            client_id: clientId,
            created_at: new Date(stamp).toISOString(),
            submission: null,
            read_by_recipient: false,
            reply_to_item_id: replyToId,
            reply_to: replyPreview,
            reactions: [],
            attachment: null,
            extra: {},
            pending: true,
          },
        }];
      })();
    setDraft("");
    setReplyTo(null);
    setActionMessageKey(null);
    setPendingAttachments([]);
    setMessages(current => plans.reduce((next, plan) => mergeMessage(next, plan.optimistic), current));
    setConversations(current => plans.reduce((next, plan) => applyConversationMessage(next, plan.optimistic, active.booking_id, user?.id), current));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    setSending(true);
    setError("");
    try {
      for (const plan of plans) {
        try {
          failedSendPlans.current[plan.clientId] = plan;
          await deliverPlan(plan);
        } catch (err) {
          if (shouldMarkSendFailed(err)) {
            markPlanFailed(plan);
            setError(extractErrorMessage(err, plan.attachment ? `Could not send ${plan.attachment.name}.` : "Could not send your message."));
          } else {
            schedulePendingFailure(plan);
          }
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function attachDocument() {
    if (!active) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/msword",
          "application/vnd.ms-powerpoint",
          "application/vnd.ms-excel",
          "text/plain",
          "text/csv",
          "text/markdown",
          "application/json",
        ],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      const oversized = result.assets.find(asset => asset.size && asset.size > MAX_CHAT_FILE_BYTES);
      if (oversized) {
        Alert.alert("File too large", `Choose a file no larger than ${MAX_CHAT_FILE_SIZE_LABEL}.`);
        return;
      }
      setPendingAttachments(current => {
        const availableSlots = MAX_CHAT_ATTACHMENTS - current.length;
        if (availableSlots <= 0) {
          Alert.alert("File limit reached", `You can send up to ${MAX_CHAT_ATTACHMENTS} files at once.`);
          return current;
        }
        const accepted = result.assets.slice(0, availableSlots).map(asset => ({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType,
          size: asset.size,
          file: asset.file,
        }));
        if (accepted.length < result.assets.length) {
          Alert.alert("Some files were not added", `You can send up to ${MAX_CHAT_ATTACHMENTS} files at once.`);
        }
        return [...current, ...accepted];
      });
    } catch (err) {
      setError(extractErrorMessage(err, "Could not attach this document."));
    }
  }

  async function resendMessage(message: LearningItem) {
    if (!active || !message.client_id) return;
    const plan = failedSendPlans.current[message.client_id];
    if (!plan) {
      if (message.attachment) {
        Alert.alert("Cannot resend file", "Please attach this file again, then resend it.");
        return;
      }
      const retryPlan: SendPlan = {
        clientId: message.client_id,
        bookingId: message.booking_id,
        attachment: null,
        replyToId: message.reply_to_item_id ?? undefined,
        optimistic: { ...message, failed: false, pending: true },
      };
      failedSendPlans.current[retryPlan.clientId] = retryPlan;
      setMessages(current => mergeMessage(current, retryPlan.optimistic));
      await deliverPlan(retryPlan).catch(err => {
        if (shouldMarkSendFailed(err)) markPlanFailed(retryPlan);
        else schedulePendingFailure(retryPlan);
      });
      return;
    }
    const optimistic = { ...plan.optimistic, failed: false, pending: true, created_at: new Date().toISOString() };
    const retryPlan = { ...plan, optimistic };
    failedSendPlans.current[retryPlan.clientId] = retryPlan;
    setMessages(current => mergeMessage(current, optimistic));
    setSending(true);
    setError("");
    try {
      await deliverPlan(retryPlan);
    } catch (err) {
      if (shouldMarkSendFailed(err)) {
        markPlanFailed(retryPlan);
        setError(extractErrorMessage(err, retryPlan.attachment ? `Could not send ${retryPlan.attachment.name}.` : "Could not send your message."));
      } else {
        schedulePendingFailure(retryPlan);
      }
    } finally {
      setSending(false);
    }
  }

  function startEditMessage(message: LearningItem) {
    if (message.pending || message.failed || isDeletedMessage(message)) return;
    setReplyTo(null);
    setPendingAttachments([]);
    setEditingMessage(message);
    setActionMessageKey(null);
    setDraft(message.body);
  }

  async function deleteMessage(message: LearningItem) {
    if (!active) return;
    if (message.id < 1) {
      clearSendTracking(message.client_id);
      setMessages(current => current.filter(item => item.client_id !== message.client_id));
      setActionMessageKey(null);
      return;
    }
    setActionMessageKey(null);
    if (editingMessage?.id === message.id) {
      setEditingMessage(null);
      setDraft("");
    }
    if (replyTo?.id === message.id) setReplyTo(null);
    const optimistic: LearningItem = {
      ...message,
      title: "",
      body: "This message was deleted",
      extra: { ...(message.extra ?? {}), deleted_at: new Date().toISOString() },
    };
    setMessages(current => mergeMessage(current, optimistic));
    setConversations(current => applyConversationMessage(current, optimistic, active.booking_id, user?.id));
    try {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "delete", item_id: message.id }));
      } else {
        const deleted = await deleteConversationMessage(active.booking_id, message.id);
        setMessages(current => mergeMessage(current, deleted));
        setConversations(current => applyConversationMessage(current, deleted, active.booking_id, user?.id));
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setMessages(current => mergeMessage(current, message));
        setConversations(current => applyConversationMessage(current, message, active.booking_id, user?.id));
        setError(extractErrorMessage(err, "Could not delete this message."));
      }
    }
  }

  function openMessageActions(message: LearningItem) {
    if (isDeletedMessage(message)) return;
    if (message.pending) return;
    const key = messageActionKey(message);
    setActionMessageKey(current => current === key ? null : key);
  }

  function startReplyMessage(message: LearningItem) {
    setReplyTo(message);
    setEditingMessage(null);
    setActionMessageKey(null);
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
  const threadSwipeResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_event, gesture) => {
      if (!active) return false;
      const startedAtLeftEdge = gesture.x0 <= 44;
      const movingRight = gesture.dx > 22;
      const mostlyHorizontal = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35;
      return startedAtLeftEdge && movingRight && mostlyHorizontal;
    },
    onPanResponderRelease: (_event, gesture) => {
      const completedSwipe = gesture.dx > 82 && Math.abs(gesture.dy) < 70;
      if (completedSwipe) closeConversation();
    },
  }), [active, closeConversation]);

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
              {loading ? <View style={styles.messageLoading}><LoadingState compact /></View> : conversations.length === 0 ? (
                <EmptyInbox userRole={userRole} />
              ) : filteredConversations.length === 0 ? (
                <>
                  <View style={styles.searchBar}>
                    <Ionicons name="search-outline" size={25} color={NAVY} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search conversations"
                      placeholderTextColor={MUTED_NAVY}
                      style={styles.searchInput}
                    />
                    <Ionicons name="options-outline" size={24} color={NAVY} />
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
                    <Ionicons name="search-outline" size={25} color={NAVY} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search conversations"
                      placeholderTextColor={MUTED_NAVY}
                      style={styles.searchInput}
                    />
                    <Ionicons name="options-outline" size={24} color={NAVY} />
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
          <View style={styles.threadRoot} {...threadSwipeResponder.panHandlers}>
            <View style={styles.threadHeader}>
              <Pressable accessibilityRole="button" onPress={closeConversation} style={styles.threadBack}>
                <Ionicons name="chevron-back" size={33} color={NAVY} />
              </Pressable>
              <ConversationAvatar name={active.counterpart} support={isSupportConversation(active)} size={48} />
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
              {threadLoading ? <View style={styles.messageLoading}><LoadingState compact /></View> : messages.length === 0 ? (
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
                  onOpenActions={() => openMessageActions(message)}
                  onResend={() => void resendMessage(message)}
                  onReply={() => startReplyMessage(message)}
                  onEdit={() => startEditMessage(message)}
                  onDelete={() => void deleteMessage(message)}
                  onReact={emoji => void toggleReaction(message, emoji)}
                  actionOpen={actionMessageKey === messageActionKey(message)}
                />
              ))}
              {!!typingUser && <Text style={styles.typingText}>Typing…</Text>}
            </ScrollView>

            <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
              {editingMessage && (
                <View style={styles.replyingBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.replyingLabel}>Editing message</Text>
                    <Text style={styles.replyingText} numberOfLines={1}>{editingMessage.body}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => { setEditingMessage(null); setDraft(""); }} hitSlop={8}>
                    <Ionicons name="close" size={20} color={NAVY} />
                  </Pressable>
                </View>
              )}
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
              {!!pendingAttachments.length && (
                <AttachmentPreview
                  attachments={pendingAttachments}
                  onRemove={index => setPendingAttachments(current => current.filter((_, itemIndex) => itemIndex !== index))}
                />
              )}
              <View style={styles.composer}>
                <Pressable accessibilityRole="button" onPress={attachDocument} disabled={sending || !!editingMessage} style={({ pressed }) => [styles.plusButton, pressed && styles.pressed, (sending || !!editingMessage) && styles.disabled]}>
                  <Ionicons name="add" size={24} color="#FFFFFF" />
                </Pressable>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={draft}
                    onChangeText={handleDraftChange}
                    placeholder={editingMessage ? "Edit message" : `Message ${active.counterpart.split(" ")[0] ?? ""}`}
                    placeholderTextColor={MUTED_NAVY}
                    multiline
                    style={[styles.input, Platform.OS === "web" && ({ outlineStyle: "none" } as any)]}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={sendMessage}
                  disabled={sending || (!draft.trim() && !pendingAttachments.length)}
                  style={({ pressed }) => [styles.sendButton, pressed && styles.pressed, (sending || (!draft.trim() && !pendingAttachments.length)) && styles.disabled]}
                >
                  {sending ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  keyboard: { flex: 1 },
  threadRoot: { flex: 1 },
  inboxHeader: {
    width: "100%",
    maxWidth: 470,
    minHeight: 88,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  plainBack: { marginRight: 2 },
  inboxTitleWrap: { flex: 1, minWidth: 0 },
  inboxTitle: { fontFamily: "sans-bold", fontSize: 26, lineHeight: 31, color: NAVY },
  inboxSubtitle: { marginTop: 2, fontFamily: "sans-medium", fontSize: 13, color: MUTED_NAVY },
  inboxContent: {
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
    paddingHorizontal: 15,
    paddingTop: 15,
  },
  messageLoading: {
    paddingTop: 18,
    paddingHorizontal: 8,
  },
  searchBar: {
    minHeight: 49,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    backgroundColor: "#F0F2F6",
  },
  searchInput: { flex: 1, fontFamily: "sans-medium", fontSize: 14, color: NAVY },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 24 },
  filterChip: {
    flex: 1,
    minHeight: 37,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "#F0F2F6",
  },
  filterChipActive: { backgroundColor: NAVY },
  filterText: { fontFamily: "sans-medium", fontSize: 14, color: MUTED_NAVY },
  filterTextActive: { color: "#FFFFFF" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontFamily: "sans-bold", fontSize: 18, color: MUTED_NAVY },
  editText: { fontFamily: "sans-semibold", fontSize: 15, color: "#0D63F3" },
  recentTitle: { marginTop: 30, marginBottom: 12 },
  conversationRow: { minHeight: 100, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
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
  conversationName: { flex: 1, fontFamily: "sans-bold", fontSize: 15, color: NAVY },
  conversationSubject: { marginTop: 3, fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  conversationLast: { marginTop: 6, fontFamily: "sans-medium", fontSize: 13, color: NAVY },
  lessonMeta: { marginTop: 9, flexDirection: "row", alignItems: "center", gap: 8 },
  lessonMetaText: { flex: 1, fontFamily: "sans-medium", fontSize: 13, color: MUTED_NAVY },
  conversationRight: { width: 49, minHeight: 75, alignItems: "flex-end", justifyContent: "space-between" },
  conversationTime: { fontFamily: "sans-medium", fontSize: 11, color: MUTED_NAVY },
  unreadBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: LIME },
  unreadText: { fontFamily: "sans-bold", fontSize: 11, color: NAVY },
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
    minHeight: 82,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  threadBack: { marginRight: -4 },
  threadNameBlock: { flex: 1, minWidth: 0 },
  threadNameLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  threadName: { flex: 1, fontFamily: "sans-bold", fontSize: 17, color: NAVY },
  threadSubtitle: { marginTop: 3, fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  lessonBanner: {
    minHeight: 73,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: SOFT_MINT,
    paddingHorizontal: 15,
  },
  lessonAccent: { position: "absolute", left: 10, top: 20, bottom: 10, width: 4, borderRadius: 2, backgroundColor: LIME },
  lessonIcon: { width: 37, height: 37, borderRadius: 10, alignItems: "center", justifyContent: "center", marginLeft: 10, backgroundColor: "#C6F7EE" },
  lessonCopy: { flex: 1, minWidth: 0 },
  lessonKicker: { textTransform: "uppercase", fontFamily: "sans-bold", fontSize: 10, color: MUTED_NAVY },
  lessonTitle: { marginTop: 4, fontFamily: "sans-bold", fontSize: 14, color: NAVY },
  viewLesson: { flexDirection: "row", alignItems: "center", gap: 6 },
  viewLessonText: { fontFamily: "sans-semibold", fontSize: 13, color: "#0D63F3" },
  threadContent: { width: "100%", maxWidth: 470, alignSelf: "center", paddingHorizontal: 12, paddingTop: 19, paddingBottom: 17 },
  todayLabel: { alignSelf: "center", marginBottom: 19, fontFamily: "sans-semibold", fontSize: 12, color: MUTED_NAVY },
  messageLine: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 15 },
  messageLineMine: { justifyContent: "flex-end" },
  messageStack: { maxWidth: "80%" },
  messageStackMine: { alignItems: "flex-end" },
  bubble: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 3, backgroundColor: NAVY },
  bubbleOther: { borderBottomLeftRadius: 3, backgroundColor: "#F0F3F8" },
  attachmentBubble: { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: "transparent" },
  messageText: { fontFamily: "sans-medium", fontSize: 14, lineHeight: 20, color: NAVY },
  messageTextMine: { color: "#FFFFFF" },
  deletedMessageText: { fontFamily: "sans-semibold", fontStyle: "italic", opacity: 0.72 },
  bubbleMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  bubbleMetaRowMine: { justifyContent: "flex-end" },
  bubbleTime: { fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  failedText: { color: Colors.destructive },
  failedActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  failedAction: { minHeight: 28, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, backgroundColor: "#EEF2F7" },
  failedActionText: { fontFamily: "sans-semibold", fontSize: 12, color: NAVY },
  messageActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  messageActionsMine: { justifyContent: "flex-end" },
  messageAction: { minHeight: 30, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, backgroundColor: "#EEF2F7" },
  messageActionText: { fontFamily: "sans-semibold", fontSize: 12, color: NAVY },
  deleteAction: { backgroundColor: "#FFECEA" },
  deleteActionText: { color: Colors.destructive },
  replyPreview: { borderLeftWidth: 3, borderLeftColor: Colors.teal, paddingLeft: 9, marginBottom: 8 },
  replyPreviewMine: { borderLeftColor: LIME },
  replyAuthor: { fontFamily: "sans-bold", fontSize: 12, color: NAVY },
  replyAuthorMine: { color: "#FFFFFF" },
  replyText: { marginTop: 2, fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  replyTextMine: { color: "#C9D8EC" },
  fileCard: {
    minHeight: 65,
    minWidth: 221,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE1EA",
  },
  pdfIcon: { width: 39, height: 39, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FCE8E8" },
  fileName: { fontFamily: "sans-bold", fontSize: 12, color: NAVY },
  fileMeta: { marginTop: 3, fontFamily: "sans-medium", fontSize: 10, color: MUTED_NAVY },
  downloadButton: { width: 37, height: 37, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF2F7" },
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
  previewRail: { maxHeight: 64, marginBottom: 8 },
  previewList: { flexDirection: "row", gap: 8, paddingRight: 2 },
  attachmentPreview: { width: 228, minHeight: 58, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, backgroundColor: "#F0F3F8", borderWidth: 1, borderColor: "#DADDE7" },
  previewIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: SOFT_MINT },
  previewName: { fontFamily: "sans-bold", fontSize: 13, color: NAVY },
  previewMeta: { marginTop: 2, fontFamily: "sans-medium", fontSize: 12, color: MUTED_NAVY },
  previewRemove: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  composer: { minHeight: 41, flexDirection: "row", alignItems: "center", gap: 6 },
  plusButton: { width: 37, height: 37, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: NAVY },
  inputWrap: { flex: 1, minHeight: 37, maxHeight: 75, borderRadius: 19, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, backgroundColor: "#F3F5F8", borderWidth: 1, borderColor: "#DADDE7" },
  input: { flex: 1, maxHeight: 61, fontFamily: "sans-medium", fontSize: 13, color: NAVY, paddingVertical: 4 },
  sendButton: { width: 37, height: 37, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: NAVY },
  emptyCard: { minHeight: 180, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DADDE7" },
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
  error: { width: "100%", maxWidth: 470, alignSelf: "center", marginTop: 10, borderRadius: 8, padding: 12, backgroundColor: "#FFECEA" },
  errorText: { fontFamily: "sans-semibold", fontSize: 13, color: Colors.destructive },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
