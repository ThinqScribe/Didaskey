import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Action, Card, ErrorNotice, Page, ui } from "@/components/ui/Workspace";
import { LoadingState, Rise } from "@/components/ui/Motion";
import { apiClient } from "@/lib/api/client";
import { Colors } from "@/constants";

interface Student {
  id: number;
  name: string;
  sessions: number;
  last_session: string;
}

function formatLastSession(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StudentCard({ student }: { student: Student }) {
  return (
    <Card>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person-outline" size={20} color={Colors.deepTeal} />
        </View>
        <View style={styles.identity}>
          <Text style={ui.heading} numberOfLines={1}>{student.name}</Text>
          <Text style={ui.muted}>{student.sessions} confirmed or completed sessions</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="calendar-outline" size={17} color={Colors.mutedForeground} />
        <Text style={ui.muted}>Latest scheduled lesson: {formatLastSession(student.last_session)}</Text>
      </View>
      <Action label="Open learning sessions" secondary onPress={() => router.push("/learning")} />
    </Card>
  );
}

export default function TutorStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (next = 1) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await apiClient.get<Student[]>("/tutors/me/students", { params: { page: next } });
      setStudents(current => next === 1 ? data : [...current, ...data]);
      setPage(next);
      setMore(data.length === 50);
    } catch {
      setError("Could not load your students. Please retry.");
    } finally {
      setBusy(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Page title="Your students" subtitle="The learners you support, one lesson at a time." back={false}>
      <ErrorNotice message={error} retry={() => load()} />
      {busy && !students.length ? (
        <LoadingState />
      ) : students.length ? (
        students.map((student, index) => (
          <Rise key={student.id} delay={Math.min(180, index * 35)}>
            <StudentCard student={student} />
          </Rise>
        ))
      ) : (
        <Card>
          <Text style={ui.heading}>Your first learner is ahead</Text>
          <Text style={ui.text}>Students appear here after a session is confirmed.</Text>
        </Card>
      )}
      {(busy && students.length > 0) || more ? (
        <Action label="Load more students" busy={busy} secondary onPress={() => load(page + 1)} />
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.paleTeal,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
