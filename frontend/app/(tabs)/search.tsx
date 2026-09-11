import { useState, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Colors, Spacing, TabBar } from "@/constants";
import { searchTutors, getSubjects, type TutorSummary, type Subject, type TutorSearchParams } from "@/lib/api/tutors";
import { useRefresh } from "@/lib/hooks/useRefresh";

import SearchBar from "@/components/ui/SearchBar";
import SubjectPill from "@/components/home/SubjectPill";
import TutorCard from "@/components/home/TutorCard";
import { Action, ErrorNotice, Field } from "@/components/ui/Workspace";
import { extractErrorMessage } from "@/lib/api/auth";
import { EmptyState, ScreenHeading } from "@/components/ui/AppChrome";

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.7 }]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mode, setMode] = useState<"online" | "in_person" | undefined>();
  const [maxRate, setMaxRate] = useState("");
  const [minRating, setMinRating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestId = useRef(0);

  const fetchSubjects = useCallback(async () => {
    try {
      const data = await getSubjects();
      setSubjects(data);
    } catch {
      setError("Subjects could not load. Pull to refresh and try again.");
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  const fetchTutors = useCallback(async (params: TutorSearchParams) => {
    const request = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const data = await searchTutors({ page: 1, page_size: 20, ...params });
      if (request !== requestId.current) return;
      setTutors(old => (params.page ?? 1) === 1 ? data.items : [...old, ...data.items]);
      setPage(data.page); setTotalPages(data.total_pages);
    } catch (e) {
      if (request === requestId.current) setError(extractErrorMessage(e, "Could not load tutors. Please retry."));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects, fetchTutors]);

  // Debounce text search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchTutors({ search: query || undefined, subject_id: activeSubjectId ?? undefined, teaching_mode: mode, max_rate: maxRate && Number.isFinite(Number(maxRate)) ? Number(maxRate) : undefined, min_rating: minRating ? 4 : undefined });
    }, 400);
    return () => clearTimeout(t);
  }, [query, activeSubjectId, mode, maxRate, minRating, fetchTutors]);

  const handleSubjectPress = (id: number) => {
    const next = activeSubjectId === id ? null : id;
    setActiveSubjectId(next);
  };

  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      setQuery("");
      setActiveSubjectId(null);
      setMode(undefined); setMaxRate(""); setMinRating(false);
      await Promise.all([fetchSubjects(), fetchTutors({})]);
    }, [fetchSubjects, fetchTutors])
  );

  return (
    <SafeAreaView className="flex-1" edges={["top"]} style={{ backgroundColor: Colors.background }}>
      <View style={styles.header}>
        <ScreenHeading title="Find your tutor" subtitle="Verified educators for your current learning goal." />

        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or subject"
        />
        <View style={styles.filterRow}><FilterChip label="All formats" active={mode === undefined} onPress={() => setMode(undefined)} /><FilterChip label="Online" active={mode === "online"} onPress={() => setMode("online")} /><FilterChip label="In person" active={mode === "in_person"} onPress={() => setMode("in_person")} /><Pressable accessibilityRole="button" onPress={() => setFiltersOpen(v => !v)} style={styles.filterMore}><Ionicons name="options-outline" size={16} color={Colors.deepTeal} /><Text style={styles.filterMoreText}>{filtersOpen ? "Less" : "More"}</Text></Pressable></View>
        {filtersOpen && <View style={styles.filterPanel}><FilterChip label="Rated 4★+" active={minRating} onPress={() => setMinRating(v => !v)} /><View style={{ flex: 1, minWidth: 170 }}><Field label="Maximum hourly rate" value={maxRate} onChangeText={v => setMaxRate(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="Any price" /></View></View>}
        <ErrorNotice message={error} retry={() => fetchTutors({ search: query || undefined, subject_id: activeSubjectId ?? undefined, teaching_mode: mode, max_rate: maxRate ? Number(maxRate) : undefined, min_rating: minRating ? 4 : undefined })} />

        {!loadingSubjects && subjects.length > 0 && (
          <FlatList
            data={subjects}
            keyExtractor={(s) => String(s.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: Spacing.base, paddingBottom: Spacing.base }}
            renderItem={({ item }) => (
              <SubjectPill
                subject={item}
                active={activeSubjectId === item.id}
                onPress={() => handleSubjectPress(item.id)}
              />
            )}
          />
        )}
      </View>

      {loading && tutors.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={Colors.teal} />
        </View>
      ) : tutors.length === 0 ? (
        <View style={styles.emptyWrap}><EmptyState icon="search-outline" title="No tutor matches yet" body="Try a different subject, format, rating, or price." action={<Action label="Clear filters" secondary onPress={() => { setQuery(""); setActiveSubjectId(null); setMode(undefined); setMaxRate(""); setMinRating(false); }} />} /></View>
      ) : (
        <FlatList
          data={tutors}
          ListFooterComponent={page < totalPages ? <Action label="Load more tutors" busy={loading} secondary onPress={() => fetchTutors({ page: page + 1, search: query || undefined, subject_id: activeSubjectId ?? undefined, teaching_mode: mode, max_rate: maxRate ? Number(maxRate) : undefined, min_rating: minRating ? 4 : undefined })} /> : null}
          keyExtractor={(t) => String(t.id)}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.teal}
              colors={[Colors.teal]}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: Spacing.xl,
            paddingBottom: TabBar.height + TabBar.horizontalInset + Spacing.xl,
            width: "100%",
            maxWidth: 760,
            alignSelf: "center",
          }}
          ListHeaderComponent={<Text style={styles.results}>{tutors.length} tutor{tutors.length === 1 ? "" : "s"} shown</Text>}
          renderItem={({ item }) => (
            <TutorCard
              tutor={item}
              onPress={() => router.push(`/tutor/${item.id}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { minHeight: 40, justifyContent: "center", borderRadius: 14, paddingHorizontal: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.deepTeal, borderColor: Colors.deepTeal },
  chipText: { fontFamily: "sans-semibold", fontSize: 12, color: Colors.foreground },
  chipTextActive: { color: "white" },
  filterMore: { minHeight: 40, flexDirection: "row", gap: 6, alignItems: "center", borderRadius: 14, paddingHorizontal: 13, backgroundColor: Colors.paleTeal },
  filterMoreText: { fontFamily: "sans-semibold", fontSize: 12, color: Colors.deepTeal },
  filterPanel: { flexDirection: "row", gap: 12, flexWrap: "wrap", alignItems: "flex-end", borderRadius: 20, padding: 14, backgroundColor: Colors.muted },
  results: { marginBottom: 10, fontFamily: "sans-semibold", fontSize: 12, color: Colors.mutedForeground },
  emptyWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 20 },
});
