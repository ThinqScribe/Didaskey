import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

import { registerPushToken } from "@/lib/api/learning";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let configured = false;
let lastSoundAt = 0;

function projectId() {
  return (
    Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.expoProjectId
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? undefined
  );
}

async function ensureConfigured() {
  if (configured) return;
  configured = true;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("didaskey-updates", {
      name: "Didaskey updates",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 180, 120, 180],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function registerForPushNotifications() {
  if (Platform.OS === "web") return;
  try {
    await ensureConfigured();
    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return;
    const id = projectId();
    const token = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
    await registerPushToken({ token: token.data, platform: Platform.OS, device_id: Constants.sessionId ?? null });
  } catch {
    // Push registration should never block sign-in or app boot.
  }
}

export async function notifyLocally(title: string, body: string, data?: Record<string, unknown>) {
  try {
    await ensureConfigured();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: "default",
      },
      trigger: null,
    });
  } catch {
    await playNotificationCue();
  }
}

export async function playNotificationCue() {
  const now = Date.now();
  if (now - lastSoundAt < 1200) return;
  lastSoundAt = now;
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
  }
}

export async function scheduleLessonReminderNotification(options: {
  bookingId: number;
  title: string;
  body: string;
  scheduledAt: string;
  minutesBefore?: number;
}) {
  try {
    await ensureConfigured();
    const triggerDate = new Date(new Date(options.scheduledAt).getTime() - (options.minutesBefore ?? 30) * 60_000);
    if (triggerDate.getTime() <= Date.now()) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: { booking_id: options.bookingId, kind: "lesson_reminder" },
        sound: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
  } catch {
    // Local reminders are best-effort; backend email/push reminders are authoritative.
  }
}
