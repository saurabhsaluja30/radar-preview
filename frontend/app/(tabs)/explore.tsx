import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MagnifyingGlass, SlidersHorizontal, BookmarkSimpleIcon, XIcon } from "phosphor-react-native";
import { useToast } from "@/src/components/Toast";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { JobCard, Job } from "@/src/components/JobCard";
import { Chip, EmptyState } from "@/src/components/ui";
import { INDUSTRIES, INDUSTRY_SHORT, WORK_MODES, REGIONS } from "@/src/constants";
import { useAuth } from "@/src/auth/AuthContext";

export default function Explore() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ function?: string; industry_category?: string; region?: string }>();
  const { user } = useAuth();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>(params.industry_category || params.function || "All");
  const [region, setRegion] = useState<string>(params.region || "All");
  const [mode, setMode] = useState<string>("All");
  const [sort, setSort] = useState<"newest" | "relevance">("newest");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["jobs", q, cat, region, mode, sort, user?.user_id],
    queryFn: () =>
      api("/jobs", {
        query: { q, industry_category: cat, region, work_mode: mode, sort, limit: 60 },
        auth: !!user,
      }),
  });

  const jobs: Job[] = data?.jobs || [];

  const toast = useToast();
  const qc = useQueryClient();
  const savedQ = useQuery({
    queryKey: ["saved-searches", user?.user_id],
    queryFn: () => api("/saved-searches"),
    enabled: !!user,
  });
  const savedSearches: any[] = savedQ.data?.searches || [];
  const hasFilters = !!q.trim() || cat !== "All" || region !== "All" || mode !== "All";

  const saveSearch = async () => {
    const name =
      [q.trim() && `“${q.trim()}”`, cat !== "All" && (INDUSTRY_SHORT[cat] || cat), region !== "All" && region, mode !== "All" && mode]
        .filter(Boolean)
        .join(" · ") || "My search";
    try {
      await api("/saved-searches", {
        method: "POST",
        body: { name, filters: { q: q.trim(), industry_category: cat, region, work_mode: mode, sort } },
      });
      qc.invalidateQueries({ queryKey: ["saved-searches"] });
      toast.show("Search saved", "success");
    } catch (e: any) {
      toast.show(e.message || "Could not save search", "error");
    }
  };

  const applySearch = (f: Record<string, string>) => {
    setQ(f.q || "");
    setCat(f.industry_category || "All");
    setRegion(f.region || "All");
    setMode(f.work_mode || "All");
    setSort((f.sort as any) || "newest");
  };

  const removeSearch = async (id: string) => {
    await api(`/saved-searches/${id}`, { method: "DELETE" }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["saved-searches"] });
  };

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.title}>Explore Jobs</Text>
      <View style={styles.searchBox}>
        <MagnifyingGlass size={18} color={colors.muted} />
        <TextInput
          testID="job-search-input"
          value={q}
          onChangeText={setQ}
          placeholder="Search title, company, skill..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ marginTop: 10 }}
      >
        <Chip label="All regions" selected={region === "All"} onPress={() => setRegion("All")} testID="chip-region-all" />
        {REGIONS.map((r) => (
          <Chip
            key={r}
            label={r === "India" ? "India Jobs" : "International"}
            selected={region === r}
            onPress={() => setRegion(region === r ? "All" : r)}
            testID={`chip-region-${r}`}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ marginTop: 8 }}
      >
        <Chip label="All" selected={cat === "All"} onPress={() => setCat("All")} testID="chip-ind-all" />
        {INDUSTRIES.map((c) => (
          <Chip
            key={c}
            label={INDUSTRY_SHORT[c] || c}
            selected={cat === c}
            onPress={() => setCat(cat === c ? "All" : c)}
            testID={`chip-ind-${c}`}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={{ marginTop: 8 }}
      >
        <Chip label="Any mode" selected={mode === "All"} onPress={() => setMode("All")} testID="chip-mode-all" />
        {WORK_MODES.map((m) => (
          <Chip
            key={m}
            label={m}
            selected={mode === m}
            onPress={() => setMode(mode === m ? "All" : m)}
            testID={`chip-mode-${m}`}
          />
        ))}
        <Pressable
          testID="sort-toggle"
          onPress={() => setSort(sort === "newest" ? "relevance" : "newest")}
          style={styles.sortBtn}
        >
          <SlidersHorizontal size={15} color={colors.brandPrimary} />
          <Text style={styles.sortTxt}>{sort === "newest" ? "Newest" : "Relevance"}</Text>
        </Pressable>
      </ScrollView>
      {user && (savedSearches.length > 0 || hasFilters) ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={{ marginTop: 8 }}
          testID="saved-searches-row"
        >
          {hasFilters ? (
            <Pressable onPress={saveSearch} style={styles.sortBtn} testID="save-search-btn">
              <BookmarkSimpleIcon size={15} color={colors.brandPrimary} />
              <Text style={styles.sortTxt}>Save search</Text>
            </Pressable>
          ) : null}
          {savedSearches.map((s) => (
            <View key={s.search_id} style={styles.savedChip}>
              <Pressable onPress={() => applySearch(s.filters)} testID={`saved-search-${s.search_id}`}>
                <Text style={styles.savedTxt}>{s.name}</Text>
              </Pressable>
              <Pressable onPress={() => removeSearch(s.search_id)} hitSlop={8} testID={`saved-search-del-${s.search_id}`}>
                <XIcon size={13} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.job_id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <JobCard job={item} />
          </View>
        )}
        ListHeaderComponent={Header}
        stickyHeaderIndices={[0]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No matching jobs found"
              subtitle="Try adjusting your search or filters."
              testID="jobs-empty"
            />
          ) : (
            <View style={{ padding: 24 }}>
              <Text style={{ color: colors.muted, textAlign: "center" }}>Loading curated jobs…</Text>
            </View>
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "900", marginBottom: 12, letterSpacing: -0.5 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.onSurface },
  chipRow: { gap: 8, paddingRight: 8 },
  sortBtn: {
    flexShrink: 0,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
    backgroundColor: colors.surface,
  },
  sortTxt: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700" },
  savedChip: {
    flexShrink: 0,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
  },
  savedTxt: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "700" },
}));
