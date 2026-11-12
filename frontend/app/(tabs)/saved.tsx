import React from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useRefreshOnFocus } from "@/src/hooks/useRefreshOnFocus";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { JobCard, Job } from "@/src/components/JobCard";
import { Button, EmptyState } from "@/src/components/ui";
import { useAuth } from "@/src/auth/AuthContext";

export default function Saved() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ["saved-jobs", user?.user_id],
    queryFn: () => api("/saved-jobs"),
    enabled: !!user,
  });
  useRefreshOnFocus(refetch);
  const jobs: Job[] = data?.jobs || [];

  if (!user) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.headerPad}>
          <Text style={styles.title}>Saved Jobs</Text>
        </View>
        <View style={{ padding: 24, gap: 16 }}>
          <EmptyState title="Sign in to save jobs" subtitle="Keep track of opportunities you love." />
          <Button title="Login / Register" onPress={() => router.push("/auth/login")} testID="saved-login-btn" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.job_id}
        ListHeaderComponent={
          <View style={[styles.headerPad, { paddingTop: insets.top + 10 }]}>
            <Text style={styles.title}>Saved Jobs</Text>
            <Text style={styles.sub}>{jobs.length} saved opportunit{jobs.length === 1 ? "y" : "ies"}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <JobCard job={item} />
          </View>
        )}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); }} tintColor={colors.brandPrimary} />}
        ListEmptyComponent={
          <EmptyState title="No saved jobs yet" subtitle="Tap the bookmark on any job to save it here." testID="saved-empty" />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerPad: { paddingHorizontal: 16, paddingBottom: 8 },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
}));
