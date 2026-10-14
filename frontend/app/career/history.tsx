import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TrashIcon } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Badge, Button, Card, Chip, EmptyState } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import { formatDate } from "@/src/utils/format";
import { formatErr, useCareerStyles } from "@/src/components/career";

type Tab = "resumes" | "analyses" | "interviews";

function confirm(msg: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(msg));
  return new Promise((res) =>
    Alert.alert("Please confirm", msg, [
      { text: "Cancel", style: "cancel", onPress: () => res(false) },
      { text: "Delete", style: "destructive", onPress: () => res(true) },
    ]),
  );
}

export default function CareerHistory() {
  const styles = useCareerStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(params.tab || "resumes");

  const resumes = useQuery({ queryKey: ["career", "resumes"], queryFn: () => api("/career/resumes") });
  const analyses = useQuery({ queryKey: ["career", "analyses"], queryFn: () => api("/career/analyses") });
  const sessions = useQuery({ queryKey: ["career", "interviews"], queryFn: () => api("/career/interviews") });

  const del = async (path: string, label: string) => {
    if (!(await confirm(`Delete this ${label}? This cannot be undone.`))) return;
    try {
      await api(path, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["career"] });
      toast.show("Deleted", "success");
    } catch (e) {
      toast.show(formatErr(e), "error");
    }
  };

  const Row = ({ title, sub, right, onPress, onDelete, testID }: any) => (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID={testID}>
      <Pressable style={{ flex: 1, gap: 2 }} onPress={onPress}>
        <Text style={styles.h2} numberOfLines={1}>{title}</Text>
        <Text style={styles.muted}>{sub}</Text>
      </Pressable>
      {right}
      <Pressable onPress={onDelete} hitSlop={8} style={{ padding: 8 }} testID={`${testID}-delete`}>
        <TrashIcon size={18} color={colors.error} />
      </Pressable>
    </Card>
  );

  const scored = (sessions.data?.sessions || []).filter((s: any) => s.overall_score != null).slice(0, 6).reverse();

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Career Data" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.chipWrap}>
          <Chip label="Resumes" selected={tab === "resumes"} onPress={() => setTab("resumes")} testID="hist-tab-resumes" />
          <Chip label="Analysis Reports" selected={tab === "analyses"} onPress={() => setTab("analyses")} testID="hist-tab-analyses" />
          <Chip label="Interviews" selected={tab === "interviews"} onPress={() => setTab("interviews")} testID="hist-tab-interviews" />
        </View>

        {tab === "resumes" && (
          <>
            <Button title="Create New Resume" size="sm" onPress={() => router.push("/career/resume-builder")} testID="hist-new-resume" />
            {(resumes.data?.resumes || []).length === 0 ? <EmptyState title="No saved resumes yet" testID="hist-resumes-empty" /> : null}
            {(resumes.data?.resumes || []).map((r: any) => (
              <Row
                key={r.resume_id}
                testID={`hist-resume-${r.resume_id}`}
                title={r.title}
                sub={`${r.resume_type === "fresher" ? "Fresher" : "Experienced"} · updated ${formatDate(r.updated_at)}`}
                onPress={() => router.push(`/career/resume/${r.resume_id}` as any)}
                onDelete={() => del(`/career/resumes/${r.resume_id}`, "resume")}
              />
            ))}
          </>
        )}

        {tab === "analyses" && (
          <>
            <Button title="New Analysis" size="sm" onPress={() => router.push("/career/analyser")} testID="hist-new-analysis" />
            {(analyses.data?.analyses || []).length === 0 ? <EmptyState title="No analysis reports yet" testID="hist-analyses-empty" /> : null}
            {(analyses.data?.analyses || []).map((a: any) => (
              <Row
                key={a.analysis_id}
                testID={`hist-analysis-${a.analysis_id}`}
                title={a.job_label}
                sub={formatDate(a.created_at)}
                right={<Badge label={`${a.match_score ?? "—"}/100`} color="brand" />}
                onPress={() => router.push(`/career/analyser?id=${a.analysis_id}` as any)}
                onDelete={() => del(`/career/analyses/${a.analysis_id}`, "report")}
              />
            ))}
          </>
        )}

        {tab === "interviews" && (
          <>
            <Button title="New Practice Session" size="sm" onPress={() => router.push("/career/interview")} testID="hist-new-interview" />
            {scored.length > 1 ? (
              <Card style={{ gap: 8 }} testID="hist-progress">
                <Text style={styles.h2}>Your progress</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: 90 }}>
                  {scored.map((s: any) => (
                    <View key={s.session_id} style={{ flex: 1, alignItems: "center", gap: 4 }}>
                      <Text style={styles.muted}>{s.overall_score}</Text>
                      <View style={{ width: "70%", height: Math.max(6, (s.overall_score / 100) * 60), backgroundColor: colors.brandPrimary, borderRadius: 6 }} />
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
            {(sessions.data?.sessions || []).length === 0 ? <EmptyState title="No interview sessions yet" testID="hist-interviews-empty" /> : null}
            {(sessions.data?.sessions || []).map((s: any) => (
              <Row
                key={s.session_id}
                testID={`hist-interview-${s.session_id}`}
                title={s.job_title}
                sub={`${s.interview_type} · ${formatDate(s.created_at)}`}
                right={
                  s.overall_score != null ? (
                    <Badge label={`${s.overall_score}/100`} color="brand" />
                  ) : (
                    <Badge label={s.status === "in_progress" ? "In progress" : "Ended"} color="warning" />
                  )
                }
                onPress={() => router.push(`/career/interview/${s.session_id}` as any)}
                onDelete={() => del(`/career/interviews/${s.session_id}`, "interview session")}
              />
            ))}
          </>
        )}

        <Button
          title="Delete All My Career Tools Data"
          variant="ghost"
          onPress={() => del("/career/data", "Career Tools data (all resumes, reports and interviews)")}
          testID="hist-delete-all"
        />
      </ScrollView>
    </View>
  );
}
