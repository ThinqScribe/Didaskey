import { useState, useCallback } from "react";

/**
 * useRefresh — thin wrapper around pull-to-refresh state.
 *
 * Pass an async function that re-fetches whatever the screen needs.
 * Returns { refreshing, onRefresh } to spread onto a RefreshControl.
 *
 * Usage:
 *   const { refreshing, onRefresh } = useRefresh(() =>
 *     Promise.all([fetchTutors(), fetchSubjects()])
 *   );
 */
export function useRefresh(fetcher: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetcher();
    } finally {
      setRefreshing(false);
    }
  }, [fetcher]);

  return { refreshing, onRefresh };
}
