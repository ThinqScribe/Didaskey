import { useState, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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
import { Action, ErrorNotice, Field, ui } from "@/components/ui/Workspace";
import { extractErrorMessage } from "@/lib/api/auth";

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
      <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.base }}>
        <Text className="text-[22px] font-sans-bold text-charcoal mb-4">Find a Tutor</Text>

        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or subject"
        />
        <Action label={filtersOpen ? "Hide filters" : "Filter tutors"} secondary onPress={() => setFiltersOpen(v => !v)} />
        {filtersOpen && <View style={{ gap: 10, paddingVertical: 12 }}><View style={ui.row}>
          <Action label="Any format" secondary={mode !== undefined} onPress={() => setMode(undefined)} />
          <Action label="Online" secondary={mode !== "online"} onPress={() => setMode("online")} />
          <Action label="In person" secondary={mode !== "in_person"} onPress={() => setMode("in_person")} />
          <Action label="4★ and above" secondary={!minRating} onPress={() => setMinRating(v => !v)} />
        </View><Field label="Maximum hourly rate" value={maxRate} onChangeText={v => setMaxRate(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="Any price" /></View>}
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
        <View className="flex-1 items-center justify-center gap-3">
          <Ionicons name="search-outline" size={48} color={Colors.mutedForeground} />
          <Text className="text-[15px] font-sans-semibold text-muted-foreground">
            No tutors match your search
          </Text>
        </View>
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
          }}
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
