import { useState, useCallback, useEffect } from "react";
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
import SubjectPill, { MorePill } from "@/components/home/SubjectPill";
import TutorCard from "@/components/home/TutorCard";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);

  const fetchSubjects = useCallback(async () => {
    try {
      const data = await getSubjects();
      setSubjects(data);
    } catch {
    } finally {
      setLoadingSubjects(false);
    }
  }, []);

  const fetchTutors = useCallback(async (params: TutorSearchParams) => {
    setLoading(true);
    try {
      const data = await searchTutors({ page: 1, page_size: 20, ...params });
      setTutors(data.items);
    } catch {
      setTutors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
    fetchTutors({});
  }, [fetchSubjects, fetchTutors]);

  // Debounce text search
  useEffect(() => {
    const t = setTimeout(() => {
      fetchTutors({ search: query || undefined, subject_id: activeSubjectId ?? undefined });
    }, 400);
    return () => clearTimeout(t);
  }, [query, activeSubjectId]);

  const handleSubjectPress = (id: number) => {
    const next = activeSubjectId === id ? null : id;
    setActiveSubjectId(next);
  };

  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      setQuery("");
      setActiveSubjectId(null);
      await Promise.all([fetchSubjects(), fetchTutors({})]);
    }, [fetchSubjects, fetchTutors])
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.base }}>
        <Text className="text-[22px] font-sans-bold text-charcoal mb-4">Find a Tutor</Text>

        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or subject"
        />

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
            ListFooterComponent={<MorePill onPress={() => {}} />}
          />
        )}
      </View>

      {loading ? (
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
              onBookmark={() => {}}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
