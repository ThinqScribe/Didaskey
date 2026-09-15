import { useCallback, useEffect, useState } from "react";

import { getConversations, getNotices } from "@/lib/api/learning";
import { notifyLocally } from "@/lib/device/notifications";
import { getActiveConversationBookingId } from "@/lib/store/chatPresence";
import { useAuthStore } from "@/lib/store/auth";

const REFRESH_MS = 15000;
const NOTIFY_COOLDOWN_MS = 12_000;

let globalPreviousMessages = 0;
let globalInitializedUserId: number | null = null;
const lastConversationNoticeAt = new Map<number, number>();

export function useUnreadIndicators() {
  const userId = useAuthStore(state => state.user?.id);
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });

  const load = useCallback(async () => {
    if (!userId) {
      globalPreviousMessages = 0;
      globalInitializedUserId = null;
      lastConversationNoticeAt.clear();
      setCounts({ messages: 0, notifications: 0 });
      return;
    }
    if (globalInitializedUserId !== userId) {
      globalPreviousMessages = 0;
      globalInitializedUserId = userId;
      lastConversationNoticeAt.clear();
    }
    const [conversations, notices] = await Promise.all([
      getConversations().catch(() => []),
      getNotices().catch(() => []),
    ]);
    const activeBookingId = getActiveConversationBookingId();
    const unreadOutsideActive = conversations.filter(item => (item.unread_count ?? 0) > 0 && item.booking_id !== activeBookingId);
    const nextMessages = conversations.reduce((sum, item) => sum + (item.unread_count ?? 0), 0);
    const nextNotifications = notices.filter(item => !item.read_at).length;
    if (globalPreviousMessages > 0 && nextMessages > globalPreviousMessages && unreadOutsideActive.length) {
      const latest = unreadOutsideActive.sort((a, b) => +(new Date(b.last_message_at ?? b.scheduled_at)) - +(new Date(a.last_message_at ?? a.scheduled_at)))[0];
      const now = Date.now();
      const lastNotifiedAt = lastConversationNoticeAt.get(latest.booking_id) ?? 0;
      if (now - lastNotifiedAt > NOTIFY_COOLDOWN_MS) {
        lastConversationNoticeAt.set(latest.booking_id, now);
        await notifyLocally(
          `New message from ${latest.counterpart}`,
          latest.last_message ?? "Open Didaskey to view the conversation.",
          { booking_id: latest.booking_id, kind: "message" },
        );
      }
    }
    globalPreviousMessages = nextMessages;
    setCounts({ messages: nextMessages, notifications: nextNotifications });
  }, [userId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return counts;
}
