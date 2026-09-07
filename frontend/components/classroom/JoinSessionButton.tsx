/**
 * "Join Session" control shown on booking cards for confirmed, online
 * bookings. Tapping routes through the pre-class lobby.
 *
 * The countdown / enabled-state shown here is optimistic client-side UI
 * (see `getJoinWindow`). The backend re-validates the real join window
 * the moment the user actually joins, so a stale client clock can never
 * let someone in early or lock them out when the server disagrees.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants";
import { getJoinWindow, joinCountdownLabel } from "@/lib/api/classrooms";
import type { BookingResponse } from "@/lib/api/bookings";

interface Props {
  booking: BookingResponse;
  counterpartName?: string | null;
}

export function JoinSessionButton({ booking, counterpartName }: Props) {
  const isJoinable =
    booking.status === "confirmed" && booking.session_format === "online";

  // Re-evaluate every 30 s while on screen
  const [tick, forceTick] = useState(0);
  useEffect(() => {
    if (!isJoinable) return;
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [isJoinable]);

  const window = useMemo(
    () => getJoinWindow(booking.scheduled_at, booking.duration_minutes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booking.scheduled_at, booking.duration_minutes, tick],
  );

  if (!isJoinable || window.isPast) return null;

  const label = joinCountdownLabel(window);

  return (
    <Pressable
      disabled={!window.canJoinNow}
      onPress={() =>
        router.push({
          pathname: "/classroom/lobby" as any,
          params: {
            bookingId:       String(booking.id),
            title:           booking.subject_name ?? "Session",
            counterpartName: counterpartName ?? "",
          },
        })
      }
      className={`rounded-full px-3 py-1.5 flex-row items-center gap-1.5 active:opacity-70 ${
        window.canJoinNow ? "bg-teal" : "bg-muted"
      }`}
    >
      <Ionicons
        name="videocam"
        size={13}
        color={window.canJoinNow ? Colors.white : Colors.mutedForeground}
      />
      <Text
        className={`text-[12px] font-sans-bold ${
          window.canJoinNow ? "text-white" : "text-muted-foreground"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
