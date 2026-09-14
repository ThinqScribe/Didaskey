import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Colors, TabBar } from "@/constants";
import {
  getSubjects,
  searchTutors,
  type Subject,
  type TeachingMode,
  type TutorSearchParams,
  type TutorSummary,
} from "@/lib/api/tutors";
import { formatCurrency } from "@/lib/api/bookings";
import { extractErrorMessage } from "@/lib/api/auth";
import { useRefresh } from "@/lib/hooks/useRefresh";
import { Action, ErrorNotice, Field } from "@/components/ui/Workspace";
import { EmptyState } from "@/components/ui/AppChrome";

const NAVY = "#071D3A";
const LIME = "#BFFF4B";
const MUTED_NAVY = "#66718E";
const HERO_FALLBACK =
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&fm=jpg&q=80&w=900";
const AVATAR_FALLBACKS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&fm=jpg&q=80&w=320",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&fm=jpg&q=80&w=320",
];

function primarySubject(tutor: TutorSummary) {
  return tutor.subjects[0]?.name ?? "General tutoring";
}

function tutorRating(tutor: TutorSummary) {
  const rating = Number.parseFloat(tutor.average_rating || "0");
  return Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "New";
}

function isOnlineTutor(tutor: TutorSummary) {
  return tutor.teaching_mode === "online" || tutor.teaching_mode === "both";
}

function Header({ filterCount }: { filterCount: number }) {
  return (
    <View style={styles.headerTop}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>Tutors</Text>
        <Text style={styles.subtitle}>Find the right expert for your goals</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open notifications"
        onPress={() => router.push("/notifications")}
        style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
      >
        <Ionicons name="notifications-outline" size={27} color={NAVY} />
        <View style={styles.notificationDot} />
      </Pressable>
      <Image source={{ uri: AVATAR_FALLBACKS[0] }} style={styles.headerAvatar} />
      {filterCount > 0 && <View style={styles.headerCount}><Text style={styles.headerCountText}>{filterCount}</Text></View>}
    </View>
  );
}

function SearchBox({
  value,
  onChangeText,
  onFilterPress,
  filterCount,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onFilterPress: () => void;
  filterCount: number;
}) {
  return (
    <View style={styles.searchRow}>
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={26} color={NAVY} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Search tutor or subject"
          placeholderTextColor={MUTED_NAVY}
          style={styles.searchInput}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open filters"
        onPress={onFilterPress}
        style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}
      >
        <Ionicons name="options-outline" size={28} color={LIME} />
        {filterCount > 0 && <View style={styles.filterCount}><Text style={styles.filterCountText}>{filterCount}</Text></View>}
      </Pressable>
    </View>
  );
}

function SubjectChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.subjectChip, active && styles.subjectChipActive, pressed && styles.pressed]}
    >
      <Text style={[styles.subjectChipText, active && styles.subjectChipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function FilterSummary({
  total,
  onlineOnly,
  topRated,
  onOnlinePress,
  onTopRatedPress,
}: {
  total: number;
  onlineOnly: boolean;
  topRated: boolean;
  onOnlinePress: () => void;
  onTopRatedPress: () => void;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.resultCount}>{total} tutor{total === 1 ? "" : "s"}</Text>
      <View style={styles.summaryActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: onlineOnly }}
          onPress={onOnlinePress}
          style={({ pressed }) => [styles.availabilityPill, onlineOnly && styles.availabilityPillActive, pressed && styles.pressed]}
        >
          <View style={styles.onlineDot} />
          <Text style={styles.summaryText}>Available now</Text>
          <View style={[styles.checkbox, onlineOnly && styles.checkboxActive]}>
            {onlineOnly && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
          </View>
        </Pressable>
        <View style={styles.summaryDivider} />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: topRated }}
          onPress={onTopRatedPress}
          style={({ pressed }) => [styles.sortPill, topRated && styles.sortPillActive, pressed && styles.pressed]}
        >
          <Text style={styles.summaryText}>Top rated</Text>
          <Ionicons name="chevron-down" size={18} color={NAVY} />
        </Pressable>
      </View>
    </View>
  );
}

function FeaturedTutor({ tutor }: { tutor: TutorSummary }) {
  const image = tutor.profile_image_url ?? HERO_FALLBACK;
  const rating = tutorRating(tutor);

  return (
    <View style={styles.featuredSection}>
      <View style={styles.bestMatchTitleRow}>
        <Text style={styles.sectionTitle}>Best match for you</Text>
        <View style={styles.matchBadge}><Text style={styles.matchBadgeText}>98% match</Text></View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/tutor/${tutor.id}`)}
        style={({ pressed }) => [styles.featuredCard, pressed && styles.pressed]}
      >
        <View style={styles.featuredPhotoWrap}>
          <Image source={{ uri: image }} style={styles.featuredPortrait} />
        </View>
        <View style={styles.featuredContent}>
          <View style={styles.featuredNameRow}>
            <Text style={styles.featuredName} numberOfLines={1}>{tutor.display_name}</Text>
            {tutor.verification_status === "verified" && (
              <Ionicons name="checkmark-circle" size={18} color="#1777F2" />
            )}
          </View>
          <Text style={styles.featuredSubject}>{primarySubject(tutor)}</Text>
          <Text style={styles.featuredHours}>{tutor.total_hours_taught} hours taught</Text>
          <View style={styles.featuredMetaRow}>
            <Ionicons name="star" size={19} color="#F4B321" />
            <Text style={styles.featuredMetaText}>{rating} ({tutor.review_count})</Text>
          </View>
          <View style={styles.responsePill}>
            <Ionicons name="flash" size={15} color="#00A45F" />
            <Text style={styles.responsePillText}>Responds in ~5 min</Text>
          </View>
        </View>
        <View style={styles.featuredRight}>
          <Pressable accessibilityRole="button" accessibilityLabel="Save tutor" style={({ pressed }) => [styles.bookmarkButton, pressed && styles.pressed]}>
            <Ionicons name="bookmark-outline" size={26} color={NAVY} />
          </Pressable>
          <Text style={styles.featuredRate}>{formatCurrency(tutor.rate_per_hour, tutor.currency, 0)}/hr</Text>
          <View style={styles.featuredActions}>
            <View style={styles.profileButton}>
              <Text style={styles.profileButtonText}>View profile</Text>
              <Ionicons name="arrow-forward" size={19} color={NAVY} />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function RecommendedTutor({ tutor, index }: { tutor: TutorSummary; index: number }) {
  const image = tutor.profile_image_url ?? AVATAR_FALLBACKS[index % AVATAR_FALLBACKS.length];
  const online = isOnlineTutor(tutor);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/tutor/${tutor.id}`)}
      style={({ pressed }) => [styles.tutorCard, pressed && styles.pressed]}
    >
      <View style={styles.tutorMain}>
        <View style={styles.tutorImageWrap}>
          <Image source={{ uri: image }} style={styles.tutorImage} />
        </View>
        <View style={styles.tutorCopy}>
          <View style={styles.tutorNameRow}>
            <Text style={styles.tutorName} numberOfLines={1}>{tutor.display_name}</Text>
            {tutor.verification_status === "verified" && (
              <Ionicons name="checkmark-circle" size={17} color={Colors.teal} />
            )}
          </View>
          <Text style={styles.tutorSubject} numberOfLines={1}>
            {primarySubject(tutor)} · {tutor.total_hours_taught} hours
          </Text>
          <View style={styles.tutorMetaRow}>
            <Ionicons name="star" size={18} color="#F4B321" />
            <Text style={styles.ratingText}>{tutorRating(tutor)} ({tutor.review_count})</Text>
          </View>
          <View style={styles.tutorModeRow}>
            <View style={online ? styles.onlineDotSmall : styles.peopleIconSmall}>
              {!online && <Ionicons name="people" size={11} color={NAVY} />}
            </View>
            <Text style={styles.modeChipText}>{tutor.teaching_mode === "both" ? "Online & in person" : online ? "Online" : "In person"}</Text>
          </View>
        </View>
      </View>
      <View style={styles.tutorRight}>
        <Ionicons name="bookmark-outline" size={26} color={NAVY} />
        <View style={styles.priceChevron}>
          <Text style={styles.priceText}>{formatCurrency(tutor.rate_per_hour, tutor.currency, 0)}/hr</Text>
          <Ionicons name="chevron-forward" size={24} color={NAVY} />
        </View>
      </View>
    </Pressable>
  );
}

function FilterPanel({
  maxRate,
  setMaxRate,
  minRating,
  setMinRating,
}: {
  maxRate: string;
  setMaxRate: (value: string) => void;
  minRating: boolean;
  setMinRating: (value: boolean) => void;
}) {
  return (
    <View style={styles.filterPanel}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: minRating }}
        onPress={() => setMinRating(!minRating)}
        style={({ pressed }) => [styles.panelChip, minRating && styles.panelChipActive, pressed && styles.pressed]}
      >
        <Text style={[styles.panelChipText, minRating && styles.panelChipTextActive]}>Rated 4★+</Text>
      </Pressable>
      <View style={styles.rateField}>
        <Field
          label="Maximum hourly rate"
          value={maxRate}
          onChangeText={v => setMaxRate(v.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
          placeholder="Any price"
        />
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<number | null>(null);
  const [tutors, setTutors] = useState<TutorSummary[]>([]);
  const [totalTutors, setTotalTutors] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mode, setMode] = useState<TeachingMode | undefined>();
  const [maxRate, setMaxRate] = useState("");
  const [minRating, setMinRating] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestId = useRef(0);

  const filterCount = (mode ? 1 : 0) + (minRating ? 1 : 0) + (maxRate ? 1 : 0);
  const featuredTutor = tutors[0];
  const recommendedTutors = tutors.slice(1);

  const fetchSubjects = useCallback(async () => {
    try {
      const data = await getSubjects();
      setSubjects(data);
    } catch {
      setError("Subjects could not load. Pull to refresh and try again.");
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
      setTotalTutors(data.total);
      setPage(data.page);
      setTotalPages(data.total_pages);
    } catch (e) {
      if (request === requestId.current) setError(extractErrorMessage(e, "Could not load tutors. Please retry."));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchTutors({
        search: query || undefined,
        subject_id: activeSubjectId ?? undefined,
        teaching_mode: mode,
        max_rate: maxRate && Number.isFinite(Number(maxRate)) ? Number(maxRate) : undefined,
        min_rating: minRating ? 4 : undefined,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [query, activeSubjectId, mode, maxRate, minRating, fetchTutors]);

  const { refreshing, onRefresh } = useRefresh(
    useCallback(async () => {
      setQuery("");
      setActiveSubjectId(null);
      setMode(undefined);
      setMaxRate("");
      setMinRating(false);
      await Promise.all([fetchSubjects(), fetchTutors({})]);
    }, [fetchSubjects, fetchTutors]),
  );

  const listHeader = useMemo(() => (
    <View style={styles.listHeader}>
      <Header filterCount={filterCount} />
      <SearchBox
        value={query}
        onChangeText={setQuery}
        onFilterPress={() => setFiltersOpen(v => !v)}
        filterCount={filterCount}
      />
      <FlatList
        data={subjects}
        keyExtractor={item => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.subjectList}
        ListHeaderComponent={
          <SubjectChip label="All tutors" active={activeSubjectId === null} onPress={() => setActiveSubjectId(null)} />
        }
        renderItem={({ item }) => (
          <SubjectChip
            label={item.name}
            active={activeSubjectId === item.id}
            onPress={() => setActiveSubjectId(current => current === item.id ? null : item.id)}
          />
        )}
      />
      <FilterSummary
        total={totalTutors || tutors.length}
        onlineOnly={mode === "online"}
        topRated={minRating}
        onOnlinePress={() => setMode(current => current === "online" ? undefined : "online")}
        onTopRatedPress={() => setMinRating(v => !v)}
      />
      {filtersOpen && (
        <FilterPanel
          maxRate={maxRate}
          setMaxRate={setMaxRate}
          minRating={minRating}
          setMinRating={setMinRating}
        />
      )}
      <ErrorNotice
        message={error}
        retry={() => fetchTutors({
          search: query || undefined,
          subject_id: activeSubjectId ?? undefined,
          teaching_mode: mode,
          max_rate: maxRate ? Number(maxRate) : undefined,
          min_rating: minRating ? 4 : undefined,
        })}
      />
      {featuredTutor && <FeaturedTutor tutor={featuredTutor} />}
      {!!recommendedTutors.length && (
        <View style={styles.recommendHeader}>
          <Text style={styles.sectionTitle}>Recommended tutors</Text>
          <Pressable accessibilityRole="button" style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>See all</Text>
            <Ionicons name="chevron-forward" size={23} color={NAVY} />
          </Pressable>
        </View>
      )}
      {loading && tutors.length > 0 && <ActivityIndicator color={Colors.teal} style={styles.inlineLoader} />}
    </View>
  ), [activeSubjectId, error, featuredTutor, fetchTutors, filterCount, filtersOpen, loading, maxRate, minRating, mode, query, recommendedTutors.length, subjects, totalTutors, tutors.length]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {loading && tutors.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.teal} />
        </View>
      ) : tutors.length === 0 ? (
        <FlatList
          data={[]}
          ListHeaderComponent={listHeader}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.teal} colors={[Colors.teal]} />}
          contentContainerStyle={styles.content}
          ListFooterComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="search-outline"
                title="No tutor matches yet"
                body="Try a different subject, format, rating, or price."
                action={<Action label="Clear filters" secondary onPress={() => { setQuery(""); setActiveSubjectId(null); setMode(undefined); setMaxRate(""); setMinRating(false); }} />}
              />
            </View>
          }
        />
      ) : (
        <FlatList
          data={recommendedTutors}
          keyExtractor={item => String(item.id)}
          ListHeaderComponent={listHeader}
          renderItem={({ item, index }) => <RecommendedTutor tutor={item} index={index} />}
          ItemSeparatorComponent={() => <View style={styles.rowSeparator} />}
          ListFooterComponent={page < totalPages ? (
            <Action
              label="Load more tutors"
              busy={loading}
              secondary
              onPress={() => fetchTutors({
                page: page + 1,
                search: query || undefined,
                subject_id: activeSubjectId ?? undefined,
                teaching_mode: mode,
                max_rate: maxRate ? Number(maxRate) : undefined,
                min_rating: minRating ? 4 : undefined,
              })}
            />
          ) : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.teal} colors={[Colors.teal]} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingBottom: TabBar.height + TabBar.horizontalInset + 28,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listHeader: {
    paddingTop: 16,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  headerIconButton: {
    width: 34,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: "sans-bold",
    fontSize: 30,
    lineHeight: 34,
    color: NAVY,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: "sans-medium",
    fontSize: 15,
    color: MUTED_NAVY,
  },
  notificationDot: {
    position: "absolute",
    top: 4,
    right: 3,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: LIME,
  },
  headerCount: {
    position: "absolute",
    right: -1,
    top: 26,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LIME,
  },
  headerCountText: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: NAVY,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#D6DEE4",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  searchBox: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 15,
    backgroundColor: Colors.muted,
  },
  searchInput: {
    flex: 1,
    fontFamily: "sans-medium",
    fontSize: 15,
    color: NAVY,
  },
  filterButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: NAVY,
  },
  filterCount: {
    position: "absolute",
    right: -8,
    top: -8,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LIME,
  },
  filterCountText: {
    fontFamily: "sans-bold",
    fontSize: 13,
    color: NAVY,
  },
  subjectList: {
    gap: 8,
    paddingRight: 18,
    paddingBottom: 18,
  },
  subjectChip: {
    minHeight: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    backgroundColor: Colors.muted,
  },
  subjectChipActive: {
    backgroundColor: NAVY,
  },
  subjectChipText: {
    fontFamily: "sans-semibold",
    fontSize: 13,
    color: NAVY,
  },
  subjectChipTextActive: {
    color: "#FFFFFF",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 22,
  },
  resultCount: {
    fontFamily: "sans-medium",
    fontSize: 16,
    color: NAVY,
  },
  summaryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  availabilityPill: {
    minHeight: 36,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  availabilityPillActive: {
    backgroundColor: Colors.paleTeal,
  },
  onlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#18C86F",
  },
  summaryText: {
    fontFamily: "sans-medium",
    fontSize: 13,
    color: NAVY,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: NAVY,
  },
  checkboxActive: {
    backgroundColor: NAVY,
  },
  summaryDivider: {
    width: 1,
    height: 38,
    backgroundColor: Colors.border,
  },
  sortPill: {
    minHeight: 36,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortPillActive: {
    backgroundColor: Colors.paleTeal,
  },
  filterPanel: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
    borderRadius: 8,
    padding: 14,
    backgroundColor: Colors.muted,
  },
  panelChip: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: Colors.card,
  },
  panelChipActive: {
    backgroundColor: NAVY,
  },
  panelChipText: {
    fontFamily: "sans-semibold",
    fontSize: 13,
    color: NAVY,
  },
  panelChipTextActive: {
    color: "#FFFFFF",
  },
  rateField: {
    flex: 1,
    minWidth: 180,
  },
  featuredSection: {
    marginBottom: 26,
  },
  bestMatchTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: "sans-bold",
    fontSize: 23,
    lineHeight: 28,
    color: NAVY,
  },
  matchBadge: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: LIME,
  },
  matchBadgeText: {
    fontFamily: "sans-bold",
    fontSize: 13,
    color: NAVY,
  },
  featuredCard: {
    minHeight: 152,
    flexDirection: "row",
    overflow: "hidden",
    alignItems: "center",
    gap: 10,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.paleTeal,
  },
  featuredContent: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    gap: 3,
    justifyContent: "center",
  },
  featuredPhotoWrap: {
    width: 88,
    height: 102,
    borderRadius: 8,
    position: "relative",
  },
  featuredName: {
    flex: 1,
    minWidth: 0,
    fontFamily: "sans-bold",
    fontSize: 18,
    lineHeight: 22,
    color: NAVY,
  },
  featuredNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  featuredSubject: {
    fontFamily: "sans-medium",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  featuredHours: {
    fontFamily: "sans-medium",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  featuredMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  featuredMetaText: {
    fontFamily: "sans-medium",
    fontSize: 13,
    color: NAVY,
  },
  featuredRate: {
    fontFamily: "sans-bold",
    fontSize: 19,
    color: NAVY,
  },
  featuredActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  profileButton: {
    minHeight: 38,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    backgroundColor: NAVY,
  },
  profileButtonText: {
    fontFamily: "sans-bold",
    fontSize: 12,
    color: "#FFFFFF",
  },
  bookmarkButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featuredPortrait: {
    width: 88,
    height: 102,
    borderRadius: 8,
    backgroundColor: "#D6DEE4",
  },
  featuredRight: {
    width: 104,
    alignSelf: "stretch",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  responsePill: {
    alignSelf: "flex-start",
    marginTop: 8,
    minHeight: 30,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "#E9FFE8",
  },
  responsePillText: {
    fontFamily: "sans-bold",
    fontSize: 11,
    color: NAVY,
  },
  recommendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAllText: {
    fontFamily: "sans-semibold",
    fontSize: 15,
    color: NAVY,
  },
  tutorCard: {
    minHeight: 112,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
    backgroundColor: Colors.background,
  },
  tutorMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    gap: 11,
  },
  tutorImage: {
    width: 76,
    height: 76,
    borderRadius: 12,
    backgroundColor: "#DFE4E5",
  },
  tutorImageWrap: {
    width: 76,
    height: 76,
    position: "relative",
  },
  tutorCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  tutorNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tutorName: {
    flex: 1,
    minWidth: 0,
    fontFamily: "sans-bold",
    fontSize: 17,
    lineHeight: 21,
    color: NAVY,
  },
  tutorSubject: {
    marginTop: 3,
    fontFamily: "sans-medium",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  tutorMetaRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratingText: {
    fontFamily: "sans-medium",
    fontSize: 13,
    color: NAVY,
  },
  tutorModeRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDotSmall: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#18C86F",
  },
  peopleIconSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#BDF7F3",
  },
  modeChipText: {
    fontFamily: "sans-medium",
    fontSize: 13,
    color: MUTED_NAVY,
  },
  tutorRight: {
    width: 84,
    minHeight: 90,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  priceChevron: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  priceText: {
    fontFamily: "sans-bold",
    fontSize: 16,
    color: NAVY,
  },
  rowSeparator: {
    height: 1,
    backgroundColor: Colors.border,
  },
  inlineLoader: {
    marginBottom: 16,
  },
  emptyWrap: {
    paddingTop: 36,
  },
  pressed: {
    opacity: 0.72,
  },
});
