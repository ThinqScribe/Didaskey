import { useCallback, useEffect, useState } from "react";

import { getConversations, getNotices } from "@/lib/api/learning";
import { useAuthStore } from "@/lib/store/auth";

const REFRESH_MS = 15000;

export function useUnreadIndicators() {
  const userId = useAuthStore(state => state.user?.id);
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });

  const load = useCallback(async () => {
    if (!userId) {
      setCounts({ messages: 0, notifications: 0 });
      return;
    }
    const [conversations, notices] = await Promise.all([
      getConversations().catch(() => []),
      getNotices().catch(() => []),
    ]);
    setCounts({
      messages: conversations.reduce((sum, item) => sum + (item.unread_count ?? 0), 0),
      notifications: notices.filter(item => !item.read_at).length,
    });
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
