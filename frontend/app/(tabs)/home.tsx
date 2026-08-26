import { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors, TabBar, Spacing } from "@/constants";
import { useAuthStore } from "@/lib/store/auth";
import { getSubjects, searchTutors, type Subject, type TutorSummary } from "@/lib/api/tutors";
import { useRefresh } from "@/lib/hooks/useRefresh";

import SearchBar from "@/components/ui/SearchBar";
import SectionHeader from "@/components/ui/SectionHeader";
import SubjectPill, { MorePill } from "@/components/home/SubjectPill";
import TutorCard from "@/components/home/TutorCard";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [loadingTutors, setLoadingTutors] = useState(true);
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

  const fetchTutors = useCallback(async (subjectId?: number) => {
    setLoadingTutors(true);
    try {
      const data = await searchTutors({ subject_id: subjectId, page: 1, page_size: 6 });
      setTutors(data.items);
    } catch {
      setTutors([]);
    } finally {
      setLoadingTutors(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
    fetchTutors();
  }, [fetchSubjects, fetchTutors]);

  const handleSubjectPress = (subjectId: number) => {
    const next = activeSubjectId === subjectId ? null : subjectId;
    setActiveSubjectId(next);
    fetchTutors(next ?? undefined);
  };

  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      setActiveSubjectId(null);
      await Promise.all([fetchSubjects(), fetchTutors()]);
    }, [fetchSubjects, fetchTutors])
  );

  const firstName = user?.first_name ?? "there";

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
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
          paddingTop: Spacing.base,
          paddingBottom: TabBar.height + TabBar.horizontalInset + Spacing.xl,
        }}
      >
        <View className="flex-row items-center justify-between mb-5">
          <View>
            <Text className="text-[24px] font-sans-bold text-charcoal">
              Hello, {firstName} 👋
            </Text>
            <Text className="text-[13px] font-sans-medium text-muted-foreground mt-0.5">
              Ready to learn something new?
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            className="w-10 h-10 rounded-full bg-white items-center justify-center"
            hitSlop={8}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.deepTeal} />
          </Pressable>
        </View>

        <SearchBar
          placeholder="Search tutors or subjects"
          onPress={() => router.push("/(tabs)/search")}
        />

        {!loadingSubjects && subjects.length > 0 && (
          <View className="mb-6">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingRight: Spacing.base }}
            >
              {subjects.slice(0, 4).map((subject) => (
                <SubjectPill
                  key={subject.id}
                  subject={subject}
                  active={activeSubjectId === subject.id}
                  onPress={() => handleSubjectPress(subject.id)}
                />
              ))}
              <MorePill onPress={() => router.push("/(tabs)/search")} />
            </ScrollView>
          </View>
        )}

        <View className="mb-6">
          <SectionHeader
            title="Recommended Tutors"
            actionLabel="View all"
            onAction={() => router.push("/(tabs)/search")}
          />
          {loadingTutors ? (
            <View className="py-8 items-center">
              <ActivityIndicator color={Colors.teal} />
            </View>
          ) : tutors.length === 0 ? (
            <View className="py-8 items-center">
              <Text className="text-sm font-sans-medium text-muted-foreground">
                No tutors found
              </Text>
            </View>
          ) : (
            tutors.map((tutor) => (
              <TutorCard
                key={tutor.id}
                tutor={tutor}
                onPress={() => router.push(`/tutor/${tutor.id}`)}
                onBookmark={() => {}}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
