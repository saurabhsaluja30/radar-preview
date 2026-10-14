import React, { useEffect, useState } from "react";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Card } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme } from "@/src/theme";
import { formatDate } from "@/src/utils/format";

const TOOLS: [string, string][] = [
  ["resume_builder", "ATS Resume Builder"],
  ["resume_analyser", "Resume Analyser"],
  ["interview_coach", "AI Interview Coach"],
];
const KINDS: [string, string][] = [
  ["resume_generation", "Resume generations"],
  ["resume_analysis", "Resume analyses"],
  ["interview_sessions", "Interview sessions"],
];
const TIERS: [string, string][] = [
  ["free", "Free users"],
  ["quarterly", "Quarterly"],
  ["half_yearly", "Half-Yearly"],
  ["annual", "Annual"],
];

export default function AdminCareer() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const settingsQ = useQuery({ queryKey: ["admin-career-settings"], queryFn: () => api("/admin/career/settings") });
  const statsQ = useQuery({ queryKey: ["admin-career-stats"], queryFn: () => api("/admin/career/stats") });
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsQ.data?.settings) setS(JSON.parse(JSON.stringify(settingsQ.data.settings)));
  }, [settingsQ.data]);

  const save = async () => {
    setSaving(true);
    try {
      await api("/admin/career/settings", {
        method: "PUT",
        body: { tools: s.tools, limits: s.limits, period_days: Number(s.period_days) || 30, addons: s.addons || [] },
      });
      await settingsQ.refetch();
      toast.show("Career Tools settings saved", "success");
    } catch (e: any) {
      toast.show(e.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const st = statsQ.data;
  const upd = (fn: (d: any) => void) =>
    setS((prev: any) => {
      const d = JSON.parse(JSON.stringify(prev));
      fn(d);
      return d;
    });

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Career Tools" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        {st ? (
          <Card style={{ gap: 8 }} testID="admin-career-stats">
            <Text style={styles.h}>Usage & AI cost (aggregate)</Text>
            <View style={styles.grid}>
              {[
                ["Users", st.unique_users],
                ["Resumes saved", st.saved_resumes],
                ["Analyses", st.saved_analyses],
                ["Interviews", st.interview_sessions],
                ["AI calls", st.ai.total_calls],
                ["Failed calls", st.ai.failed_calls],
                ["Est. cost", `$${st.ai.est_cost_usd}`],
                ["Tokens", st.ai.input_tokens + st.ai.output_tokens],
              ].map(([l, v]) => (
                <View key={l as string} style={styles.metric}>
                  <Text style={styles.metricVal}>{String(v)}</Text>
                  <Text style={styles.metricLbl}>{l}</Text>
                </View>
              ))}
            </View>
            {KINDS.map(([k, l]) => (
              <Text key={k} style={styles.p}>
                {l}: {st.usage[k].last_30d} in last 30 days · {st.usage[k].total} total
              </Text>
            ))}
            <Text style={styles.muted}>Model: {st.ai.model} · AI configured: {st.ai_configured ? "Yes" : "No — set EMERGENT_LLM_KEY"}</Text>
            <Text style={[styles.h2, { marginTop: 6 }]}>Recent failed requests</Text>
            {st.recent_failures.length === 0 ? <Text style={styles.muted}>No failures 🎉</Text> : null}
            {st.recent_failures.map((f: any, i: number) => (
              <Text key={i} style={styles.muted}>
                {formatDate(f.created_at)} · {f.purpose} · {f.error}
              </Text>
            ))}
            <Text style={styles.muted}>Private resumes and interview answers are never shown here.</Text>
          </Card>
        ) : null}

        {s ? (
          <>
            <Card style={{ gap: 12 }}>
              <Text style={styles.h}>Tool access</Text>
              {TOOLS.map(([k, l]) => (
                <View key={k} style={{ gap: 6 }}>
                  <Text style={styles.h2}>{l}</Text>
                  <View style={styles.switchRow}>
                    <Text style={styles.p}>Enabled</Text>
                    <Switch
                      value={!!s.tools[k]?.enabled}
                      onValueChange={(v) => upd((d) => (d.tools[k].enabled = v))}
                      trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
                      testID={`admin-career-${k}-enabled`}
                    />
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={styles.p}>Available to free users</Text>
                    <Switch
                      value={!!s.tools[k]?.free_access}
                      onValueChange={(v) => upd((d) => (d.tools[k].free_access = v))}
                      trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
                      testID={`admin-career-${k}-free`}
                    />
                  </View>
                </View>
              ))}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={styles.h}>Usage limits per period</Text>
              <View style={styles.switchRow}>
                <Text style={styles.p}>Period length (days)</Text>
                <TextInput
                  value={String(s.period_days)}
                  onChangeText={(v) => upd((d) => (d.period_days = v.replace(/\D/g, "")))}
                  keyboardType="number-pad"
                  style={styles.num}
                  testID="admin-career-period"
                />
              </View>
              {TIERS.map(([t, tl]) => (
                <View key={t} style={{ gap: 6, marginTop: 6 }}>
                  <Text style={styles.h2}>{tl}</Text>
                  {KINDS.map(([k, l]) => (
                    <View key={k} style={styles.switchRow}>
                      <Text style={styles.p}>{l}</Text>
                      <TextInput
                        value={String(s.limits[t]?.[k] ?? 0)}
                        onChangeText={(v) => upd((d) => (d.limits[t][k] = Number(v.replace(/\D/g, "")) || 0))}
                        keyboardType="number-pad"
                        style={styles.num}
                        testID={`admin-limit-${t}-${k}`}
                      />
                    </View>
                  ))}
                </View>
              ))}
            </Card>

            <Card style={{ gap: 10 }}>
              <Text style={styles.h}>Optional paid add-ons</Text>
              <Text style={styles.muted}>
                Add-ons are shown to candidates only when enabled. Candidates are never charged automatically.
              </Text>
              {(s.addons || []).map((a: any, i: number) => (
                <View key={a.key} style={styles.switchRow}>
                  <Text style={[styles.p, { flex: 1 }]}>{a.name} (₹{a.price})</Text>
                  <Switch
                    value={!!a.enabled}
                    onValueChange={(v) => upd((d) => (d.addons[i].enabled = v))}
                    trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
                    testID={`admin-addon-${a.key}`}
                  />
                </View>
              ))}
            </Card>

            <Button title="Save Settings" loading={saving} onPress={save} testID="admin-career-save" />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  h2: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  p: { color: colors.onSurfaceSecondary, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 10 },
  metricVal: { color: colors.brandPrimary, fontSize: 18, fontWeight: "900" },
  metricLbl: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  num: {
    width: 70,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: "center",
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
}));
