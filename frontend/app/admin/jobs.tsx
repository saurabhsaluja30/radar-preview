import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, DotsThreeVertical, MagnifyingGlass } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Card, Badge, Chip } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { JOB_STATUSES } from "@/src/constants";

export default function AdminJobs() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("All");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["admin-jobs", q, status],
    queryFn: () => api("/admin/jobs", { query: { q, status } }),
  });
  const jobs: any[] = data?.jobs || [];

  const act = async (jobId: string, fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      toast.show(msg, "success");
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      setMenuFor(null);
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Job Management"
        right={
          <Pressable onPress={() => router.push("/admin/job-edit")} testID="admin-add-job" hitSlop={8}>
            <Plus size={24} color={colors.brandPrimary} weight="bold" />
          </Pressable>
        }
      />
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search jobs..." placeholderTextColor={colors.muted} style={styles.searchInput} testID="admin-job-search" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          <Chip label="All" selected={status === "All"} onPress={() => setStatus("All")} />
          {JOB_STATUSES.map((s) => (
            <Chip key={s} label={s} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        {jobs.map((j) => (
          <Card key={j.job_id} testID={`admin-job-${j.job_id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: "/admin/job-edit", params: { id: j.job_id } })}>
                <Text style={styles.jobTitle}>{j.title}</Text>
                <Text style={styles.jobCompany}>{j.company} · {j.location}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                  <Badge label={j.status} color={j.status === "Published" ? "success" : j.status === "Draft" ? "warning" : "info"} />
                  {j.featured ? <Badge label="Featured" color="brand" /> : null}
                  <Text style={styles.stat}>{j.views || 0} views · {j.saves || 0} saves</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setMenuFor(menuFor === j.job_id ? null : j.job_id)} hitSlop={8} testID={`admin-job-menu-${j.job_id}`}>
                <DotsThreeVertical size={22} color={colors.muted} weight="bold" />
              </Pressable>
            </View>
            {menuFor === j.job_id ? (
              <View style={styles.menu}>
                {[
                  ["Edit", () => router.push({ pathname: "/admin/job-edit", params: { id: j.job_id } })],
                  [j.status === "Published" ? "Unpublish" : "Publish", () => act(j.job_id, () => api(`/admin/jobs/${j.job_id}/status`, { method: "POST", body: { status: j.status === "Published" ? "Unpublished" : "Published" } }), "Status updated")],
                  ["Mark Expired", () => act(j.job_id, () => api(`/admin/jobs/${j.job_id}/status`, { method: "POST", body: { status: "Expired" } }), "Marked expired")],
                  [j.featured ? "Unfeature" : "Feature", () => act(j.job_id, () => api(`/admin/jobs/${j.job_id}/feature`, { method: "POST", body: { featured: !j.featured } }), "Updated")],
                  ["Duplicate", () => act(j.job_id, () => api(`/admin/jobs/${j.job_id}/duplicate`, { method: "POST" }), "Duplicated")],
                  ["Delete", () => act(j.job_id, () => api(`/admin/jobs/${j.job_id}`, { method: "DELETE" }), "Deleted"), true],
                ].map(([label, fn, danger]: any) => (
                  <Pressable key={label} onPress={fn} style={styles.menuItem} testID={`admin-job-action-${label}`}>
                    <Text style={[styles.menuTxt, danger && { color: colors.error }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        ))}
        {jobs.length === 0 ? <Text style={styles.empty}>No jobs found.</Text> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.onSurface },
  jobTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  jobCompany: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  stat: { color: colors.muted, fontSize: 11, fontWeight: "600", alignSelf: "center" },
  menu: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 6 },
  menuItem: { paddingVertical: 11 },
  menuTxt: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  empty: { color: colors.muted, textAlign: "center", marginTop: 30 },
}));
