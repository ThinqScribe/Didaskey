import { Platform } from "react-native";
import * as Calendar from "expo-calendar";

import { formatBookingTimeRange, type BookingResponse } from "@/lib/api/bookings";

const CALENDAR_TITLE = "Didaskey Lessons";

async function writableCalendar() {
  const permission = await Calendar.requestCalendarPermissions(false);
  if (!permission.granted) throw new Error("Calendar permission was not granted.");

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const existing = calendars.find(calendar => calendar.title === CALENDAR_TITLE && calendar.allowsModifications);
  if (existing) return existing;

  const fallback = calendars.find(calendar => calendar.allowsModifications);
  if (Platform.OS === "ios" && fallback?.source) {
    return Calendar.createCalendar({
      title: CALENDAR_TITLE,
      color: "#0B5F60",
      entityType: Calendar.EntityTypes.EVENT,
      source: fallback.source,
      allowsModifications: true,
    });
  }
  if (fallback) return fallback;
  return Calendar.createCalendar({
    title: CALENDAR_TITLE,
    color: "#0B5F60",
    entityType: Calendar.EntityTypes.EVENT,
    allowsModifications: true,
  });
}

export async function addBookingToCalendar(booking: Pick<BookingResponse, "id" | "subject_name" | "tutor_name" | "scheduled_at" | "duration_minutes" | "session_format">) {
  const calendar = await writableCalendar();
  const startDate = new Date(booking.scheduled_at);
  const endDate = new Date(startDate.getTime() + booking.duration_minutes * 60_000);
  const subject = booking.subject_name ?? "Tutoring";
  const location = booking.session_format === "online" ? "Didaskey live classroom" : "Confirmed lesson location";
  const title = `${subject} with ${booking.tutor_name}`;
  const notes = `Didaskey booking DID${String(booking.id).padStart(8, "0")} · ${formatBookingTimeRange(booking.scheduled_at, booking.duration_minutes)}`;
  await calendar.createEvent({
    title,
    startDate,
    endDate,
    timeZone: "Africa/Lagos",
    location,
    notes,
    alarms: [{ relativeOffset: -30 }, { relativeOffset: -5 }],
  });
}

export async function syncBookingsToCalendar(bookings: BookingResponse[]) {
  const upcoming = bookings.filter(booking => booking.status === "confirmed" && new Date(booking.scheduled_at).getTime() > Date.now());
  for (const booking of upcoming) {
    await addBookingToCalendar(booking);
  }
  return upcoming.length;
}
