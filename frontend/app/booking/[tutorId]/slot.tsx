/**
 * Booking Step 1 + 2 — Session Type & Schedule
 */

import { useCallback, useMemo, useState } from "react";
import { ScrollView, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Spacing } from "@/constants";
import type { AvailabilitySlot, TeachingMode, TutorSubjectItem } from "@/lib/api/tutors";
import type { SessionFormat } from "@/lib/api/bookings";
import { estimateAmount, formatCurrency } from "@/lib/api/bookings";

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DURATIONS = [30, 60, 90, 120] as const;
const PLATFORM_FEE = 3.5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function generateSlots(start: string, end: string): string[] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const slots: string[] = [];
  for (let m = startMins; m < endMins; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${h.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}:00`);
  }
  return slots;
}

/** Returns all days in a given month as a grid (with leading/trailing nulls to align to Sun). */
function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
  // Pad to complete last row
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

/**
 * Build a timezone-aware ISO 8601 string like "2024-05-20T14:00:00+01:00".
 *
 * We deliberately preserve the device's local UTC offset instead of
 * converting to UTC with toISOString(), because the backend's availability
 * check compares the day-of-week and wall-clock time against the tutor's
 * schedule.  Sending a UTC string for a slot that was picked in WAT (UTC+1)
 * would shift the datetime by one hour and potentially change the day,
 * causing a false "tutor not available" 409.
 */
function buildScheduledAtFromSelection(date: Date, timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);

  // Offset in minutes — negative means ahead of UTC (e.g. WAT = -60)
  const offsetMins = -d.getTimezoneOffset();
  const sign = offsetMins >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMins);
  const oh = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const om = String(absOffset % 60).padStart(2, "0");

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${oh}:${om}`
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 }) {
  const steps = ["Session", "Schedule", "Review", "Payment"];
  return (
    <View className="flex-row items-center justify-center py-3">
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <View key={label} className="flex-row items-center">
            <View
              className={`w-6 h-6 rounded-full items-center justify-center ${
                active ? "bg-deep-teal" : done ? "bg-teal" : "bg-muted"
              }`}
            >
              {done ? (
                <Ionicons name="checkmark" size={12} color={Colors.white} />
              ) : (
                <Text
                  className={`text-[10px] font-sans-bold ${
                    active ? "text-white" : "text-muted-foreground"
                  }`}
                >
                  {idx}
                </Text>
              )}
            </View>
            <Text
              className={`text-[10px] font-sans-medium ml-1 ${
                active ? "text-charcoal" : "text-muted-foreground"
              }`}
            >
              {label}
            </Text>
            {i < steps.length - 1 && (
              <View className="w-4 h-px bg-border mx-1" />
            )}
          </View>
        );
      })}
    </View>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <Text className="text-[13px] font-sans-semibold text-muted-foreground mb-3 uppercase tracking-wider">
      {title}
    </Text>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SlotScreen() {
  const params = useLocalSearchParams<{
    tutorId: string;
    displayName: string;
    ratePerHour: string;
    currency: string;
    teachingMode: string;
    availabilitySlots: string;
    tutorSubjects: string;
    primarySubject: string;
  }>();

  const tutorId = Number(params.tutorId);
  const rate = params.ratePerHour ?? "0";
  const currency = params.currency ?? "NGN";
  const teachingMode = (params.teachingMode ?? "both") as TeachingMode;

  const availabilitySlots: AvailabilitySlot[] = useMemo(
    () => (params.availabilitySlots ? JSON.parse(params.availabilitySlots) : []),
    [params.availabilitySlots]
  );
  const tutorSubjects: TutorSubjectItem[] = useMemo(
    () => (params.tutorSubjects ? JSON.parse(params.tutorSubjects) : []),
    [params.tutorSubjects]
  );

  // ── State ───────────────────────────────────────────────────────────────────

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [step, setStep] = useState<1 | 2>(1);
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>(
    teachingMode === "in_person" ? "in_person" : "online"
  );
  const [duration, setDuration] = useState<number>(60);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    tutorSubjects[0]?.subject_id ?? null
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());

  // ── Calendar helpers ────────────────────────────────────────────────────────

  const availableDayNames = useMemo(
    () => new Set(availabilitySlots.map((s) => s.day_of_week)),
    [availabilitySlots]
  );

  const isDayAvailable = useCallback(
    (date: Date) => {
      if (date < today) return false;
      return availableDayNames.has(DAY_NAMES[date.getDay()]);
    },
    [availableDayNames, today]
  );

  const monthGrid = useMemo(() => buildMonthGrid(calYear, calMonth), [calYear, calMonth]);

  const monthLabel = useMemo(
    () => new Date(calYear, calMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [calYear, calMonth]
  );

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  // ── Time slots ──────────────────────────────────────────────────────────────

  const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return [];
    const dayName = DAY_NAMES[selectedDate.getDay()];
    const windows = availabilitySlots.filter((s) => s.day_of_week === dayName);
    const all: string[] = [];
    for (const w of windows) all.push(...generateSlots(w.start_time, w.end_time));
    return [...new Set(all)].sort();
  }, [selectedDate, availabilitySlots]);

  // ── Pricing ─────────────────────────────────────────────────────────────────

  const effectiveRate = useMemo(() => {
    if (selectedSubjectId !== null) {
      const ts = tutorSubjects.find((t) => t.subject_id === selectedSubjectId);
      if (ts?.rate_override) return ts.rate_override;
    }
    return rate;
  }, [selectedSubjectId, tutorSubjects, rate]);

  const tutorFee = useMemo(() => estimateAmount(effectiveRate, duration), [effectiveRate, duration]);
  const total = tutorFee + PLATFORM_FEE;

  // ── Navigation ──────────────────────────────────────────────────────────────

  const canProceedStep2 = selectedDate !== null && selectedTime !== null;

  function handleContinue() {
    if (step === 1) { setStep(2); return; }
    router.push({
      pathname: `/booking/${tutorId}/confirm` as any,
      params: {
        displayName: params.displayName,
        ratePerHour: rate,
        currency,
        sessionFormat,
        duration: String(duration),
        subjectId: selectedSubjectId !== null ? String(selectedSubjectId) : "",
        subjectName:
          tutorSubjects.find((t) => t.subject_id === selectedSubjectId)?.subject.name ??
          params.primarySubject ?? "",
        scheduledAt: buildScheduledAtFromSelection(selectedDate!, selectedTime!),
        tutorFee: tutorFee.toFixed(2),
        platformFee: PLATFORM_FEE.toFixed(2),
        total: total.toFixed(2),
        primarySubject: params.primarySubject ?? "",
      },
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAF9" }}>
      {/* Top safe area + header */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#FAFAF9" }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            onPress={() => (step === 2 ? setStep(1) : router.back())}
            hitSlop={10}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="chevron-back" size={23} color={Colors.charcoal} />
          </Pressable>
          <Text className="font-sans-bold" style={{ flex: 1, textAlign: "center", fontSize: 16, color: Colors.charcoal }}>
            Book a Session
          </Text>
          <View style={{ width: 36 }} />
        </View>
        <StepIndicator current={step} />
      </SafeAreaView>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: Spacing.xl, paddingBottom: 24 }}
      >
        {step === 1 ? (
          <Step1
            teachingMode={teachingMode}
            sessionFormat={sessionFormat}
            onFormatChange={setSessionFormat}
            duration={duration}
            onDurationChange={setDuration}
            tutorSubjects={tutorSubjects}
            selectedSubjectId={selectedSubjectId}
            onSubjectChange={setSelectedSubjectId}
            ratePerHour={rate}
            displayName={params.displayName ?? ""}
            tutorFee={tutorFee}
            currency={currency}
          />
        ) : (
          <Step2
            monthGrid={monthGrid}
            monthLabel={monthLabel}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            isDayAvailable={isDayAvailable}
            selectedDate={selectedDate}
            onDateChange={(d) => { setSelectedDate(d); setSelectedTime(null); }}
            availableTimeSlots={availableTimeSlots}
            selectedTime={selectedTime}
            onTimeChange={setSelectedTime}
          />
        )}
      </ScrollView>

      {/* Sticky CTA — always visible, outside ScrollView */}
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: "#fff" }}>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: Colors.border,
            paddingHorizontal: Spacing.xl,
            paddingTop: 14,
            paddingBottom: 14,
          }}
        >
          <Pressable
            onPress={handleContinue}
            disabled={step === 2 && !canProceedStep2}
            style={{
              backgroundColor: Colors.deepTeal,
              borderRadius: 12,
              alignItems: "center",
              paddingVertical: 16,
              opacity: step === 2 && !canProceedStep2 ? 0.45 : 1,
            }}
          >
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#fff" }}>
              Continue
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────────────────

function Step1({
  teachingMode, sessionFormat, onFormatChange,
  duration, onDurationChange,
  tutorSubjects, selectedSubjectId, onSubjectChange,
  ratePerHour, displayName, tutorFee, currency,
}: {
  teachingMode: TeachingMode;
  sessionFormat: SessionFormat;
  onFormatChange: (f: SessionFormat) => void;
  duration: number;
  onDurationChange: (d: number) => void;
  tutorSubjects: TutorSubjectItem[];
  selectedSubjectId: number | null;
  onSubjectChange: (id: number | null) => void;
  ratePerHour: string;
  displayName: string;
  tutorFee: number;
  currency: string;
}) {
  const canOnline = teachingMode === "online" || teachingMode === "both";
  const canInPerson = teachingMode === "in_person" || teachingMode === "both";

  return (
    <View className="pt-4">
      <Text className="text-[20px] font-sans-bold text-charcoal mb-1">Select Session Type</Text>
      <Text className="text-[13px] font-sans-medium text-muted-foreground mb-6">
        Choose how you would like to learn.
      </Text>

      {/* Session type card */}
      <View className="bg-white rounded-xl border border-border p-4 mb-6">
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
            <Ionicons name="person" size={18} color={Colors.deepTeal} />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-sans-bold text-charcoal">1-on-1 Session</Text>
            <Text className="text-[12px] font-sans-medium text-muted-foreground">
              Personalised one-on-one with the tutor
            </Text>
          </View>
          <View className="w-5 h-5 rounded-full border-2 border-deep-teal items-center justify-center">
            <View className="w-2.5 h-2.5 rounded-full bg-deep-teal" />
          </View>
        </View>
        <View className="h-px bg-border my-3" />
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-full bg-muted items-center justify-center">
            <Ionicons name="people" size={18} color={Colors.mutedForeground} />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-sans-bold text-muted-foreground">Group Session</Text>
            <Text className="text-[12px] font-sans-medium text-muted-foreground">
              Learn in a small group with other students
            </Text>
          </View>
          <View className="w-5 h-5 rounded-full border-2 border-border" />
        </View>
      </View>

      {/* Learning format */}
      <SectionLabel title="Learning Format" />
      <View className="gap-3 mb-6">
        {canOnline && (
          <FormatOption
            icon="videocam-outline" label="Online" description="Join from anywhere"
            selected={sessionFormat === "online"} onPress={() => onFormatChange("online")}
          />
        )}
        {canInPerson && (
          <FormatOption
            icon="location-outline" label="In-Person" description="Meet at a physical location"
            selected={sessionFormat === "in_person"} onPress={() => onFormatChange("in_person")}
          />
        )}
      </View>

      {/* Duration */}
      <SectionLabel title="Duration" />
      <View className="flex-row gap-2 mb-6">
        {DURATIONS.map((d) => (
          <Pressable
            key={d}
            onPress={() => onDurationChange(d)}
            className={`flex-1 py-3 rounded-xl items-center ${duration === d ? "bg-deep-teal" : "bg-white"}`}
          >
            <Text className={`text-[13px] font-sans-bold ${duration === d ? "text-white" : "text-charcoal"}`}>
              {d < 60 ? `${d}m` : `${d / 60}h`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Subject */}
      {tutorSubjects.length > 1 && (
        <>
          <SectionLabel title="Subject" />
          <View className="gap-2 mb-6">
            {tutorSubjects.map((ts) => (
              <Pressable
                key={ts.subject_id}
                onPress={() => onSubjectChange(ts.subject_id)}
                className={`flex-row items-center justify-between rounded-xl px-4 py-3 ${
                  selectedSubjectId === ts.subject_id ? "bg-deep-teal/10" : "bg-white"
                }`}
              >
                <Text className={`text-[14px] font-sans-semibold ${
                  selectedSubjectId === ts.subject_id ? "text-deep-teal" : "text-charcoal"
                }`}>
                  {ts.subject.name}
                </Text>
                {ts.rate_override && (
                  <Text className="text-[12px] font-sans-medium text-muted-foreground">
                    {formatCurrency(parseFloat(ts.rate_override), currency, 0)}/hr
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Tutor summary */}
      <View className="bg-muted rounded-2xl px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text className="text-[13px] font-sans-bold text-charcoal">{displayName}</Text>
          <Text className="text-[12px] font-sans-medium text-muted-foreground">
            {formatCurrency(parseFloat(ratePerHour), currency, 0)}/hr
          </Text>
        </View>
        <Text className="text-[18px] font-sans-bold text-deep-teal">
          {formatCurrency(tutorFee, currency, 0)}
        </Text>
      </View>
    </View>
  );
}

function FormatOption({ icon, label, description, selected, onPress }: {
  icon: string; label: string; description: string; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center rounded-2xl px-4 py-3 gap-3 ${selected ? "bg-deep-teal/10" : "bg-white"}`}
    >
      <View className={`w-10 h-10 rounded-full items-center justify-center ${selected ? "bg-deep-teal" : "bg-muted"}`}>
        <Ionicons name={icon as any} size={18} color={selected ? Colors.white : Colors.deepTeal} />
      </View>
      <View className="flex-1">
        <Text className={`text-[14px] font-sans-bold ${selected ? "text-deep-teal" : "text-charcoal"}`}>{label}</Text>
        <Text className="text-[12px] font-sans-medium text-muted-foreground">{description}</Text>
      </View>
      <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${selected ? "border-deep-teal" : "border-border"}`}>
        {selected && <View className="w-2.5 h-2.5 rounded-full bg-deep-teal" />}
      </View>
    </Pressable>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

function Step2({
  monthGrid, monthLabel, onPrevMonth, onNextMonth,
  isDayAvailable, selectedDate, onDateChange,
  availableTimeSlots, selectedTime, onTimeChange,
}: {
  monthGrid: (Date | null)[];
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  isDayAvailable: (d: Date) => boolean;
  selectedDate: Date | null;
  onDateChange: (d: Date) => void;
  availableTimeSlots: string[];
  selectedTime: string | null;
  onTimeChange: (t: string) => void;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const rows = useMemo(() => {
    const r: (Date | null)[][] = [];
    for (let i = 0; i < monthGrid.length; i += 7) r.push(monthGrid.slice(i, i + 7));
    return r;
  }, [monthGrid]);

  return (
    <View style={{ paddingTop: 16 }}>
      <Text className="font-sans-semibold" style={{ fontSize: 20, color: Colors.charcoal, marginBottom: 4 }}>
        Select Date &amp; Time
      </Text>
      <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.mutedForeground, marginBottom: 20 }}>
        Choose a date and available time.
      </Text>

      {/* Month navigation */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Pressable onPress={onPrevMonth} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={18} color={Colors.charcoal} />
        </Pressable>
        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.charcoal }}>
          {monthLabel}
        </Text>
        <Pressable onPress={onNextMonth} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="chevron-forward" size={18} color={Colors.charcoal} />
        </Pressable>
      </View>

      {/* Day-of-week header */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {DAYS_SHORT.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.mutedForeground }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", marginBottom: 4 }}>
          {row.map((day, ci) => {
            if (!day) return <View key={ci} style={{ flex: 1 }} />;
            const available = isDayAvailable(day);
            const isSelected = selectedDate?.toDateString() === day.toDateString();
            const isToday = today.toDateString() === day.toDateString();
            return (
              <Pressable
                key={ci}
                onPress={() => available && onDateChange(day)}
                disabled={!available}
                style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
              >
                <View
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: isSelected ? Colors.deepTeal : isToday ? Colors.muted : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Inter_600SemiBold",
                      color: isSelected ? "#fff" : available ? Colors.charcoal : Colors.mutedForeground,
                      opacity: available ? 1 : 0.35,
                    }}
                  >
                    {day.getDate()}
                  </Text>
                </View>
                {available && !isSelected && (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.teal, marginTop: 2 }} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* Time slots */}
      <View style={{ marginTop: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Available Times
          </Text>
          <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.mutedForeground }}>
            (GMT+1)
          </Text>
        </View>

        {!selectedDate ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <Ionicons name="calendar-outline" size={36} color={Colors.mutedForeground} />
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.mutedForeground, marginTop: 8 }}>
              Select a date to see available times
            </Text>
          </View>
        ) : availableTimeSlots.length === 0 ? (
          <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.mutedForeground, textAlign: "center", paddingVertical: 24 }}>
            No available slots on this day
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {availableTimeSlots.map((t) => {
              const sel = selectedTime === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => onTimeChange(t)}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: sel ? Colors.deepTeal : Colors.border,
                    backgroundColor: sel ? Colors.deepTeal : "#fff",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: sel ? "#fff" : Colors.charcoal }}>
                    {formatTime(t)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
