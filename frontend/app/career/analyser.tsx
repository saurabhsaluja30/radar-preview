import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Badge, Button, Card } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import {
  AiDisclaimer,
  BulletList,
  ConsentGate,
  ScoreRing,
  UsagePill,
  formatErr,
  useCareerStyles,
  useCareerUsage,
  useInvalidateUsage,
} from "@/src/components/career";

export default function Analyser() {
  const styles = useCareerStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: usage } = useCareerUsage();
  const invalidate = useInvalidateUsage();

  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  useQuery({
    queryKey: ["analysis", id],
    enabled: !!id,
    queryFn: async () => {
      const r = await api(`/career/analyses/${id}`);
      setAnalysis(r.analysis);
      return r;
    },
  });

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const r = await api("/career/analyse", { method: "POST", body: { resume_text: resume, jd_text: jd } });
      setAnalysis(r.analysis);
      await invalidate();
      if (r.reused) toast.show("Showing your saved analysis for the same resume & JD", "info");
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const improve = async () => {
    if (improving) return;
    setImproving(true);
    try {
      const r = await api(`/career/analyses/${analysis.analysis_id}/improve`, { method: "POST" });
      await invalidate();
      router.push(`/career/resume/${r.resume.resume_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setImproving(false);
    }
  };

  const res = analysis?.result;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Resume Analyser" />
      <ConsentGate>
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>
          {!res ? (
            <>
              <View>
                <Text style={styles.label}>Box 1: Paste Your Resume</Text>
                <TextInput
                  multiline
                  value={resume}
                  onChangeText={setResume}
                  placeholder="Copy the full text of your resume and paste it here"
                  placeholderTextColor={colors.muted}
                  style={[styles.area, { minHeight: 180 }]}
                  maxLength={15000}
                  testID="an-resume"
                />
              </View>
              <View>
                <Text style={styles.label}>Box 2: Paste Job Description</Text>
                <TextInput
                  multiline
                  value={jd}
                  onChangeText={setJd}
                  placeholder="Paste the complete job description"
                  placeholderTextColor={colors.muted}
                  style={[styles.area, { minHeight: 180 }]}
                  maxLength={12000}
                  testID="an-jd"
                />
              </View>
              <UsagePill tool="resume_analyser" usage={usage} />
              <Button title="Analyse Resume" loading={loading} onPress={run} testID="an-submit" />
              {loading ? <Text style={styles.muted}>Analysing… this usually takes 20–40 seconds.</Text> : null}
              <AiDisclaimer />
            </>
          ) : (
            <AnalysisResult res={res} />
          )}

          {res ? (
            <>
              <Card style={{ gap: 10 }}>
                <Text style={styles.h2}>H. Improved Resume</Text>
                <Text style={styles.muted}>
                  Generate an improved, ATS-friendly version using only your genuine experience, skills and
                  qualifications. You can edit it and download as PDF or DOCX.
                </Text>
                <UsagePill tool="resume_builder" usage={usage} />
                <Button
                  title={analysis.improved_resume_id ? "Open Improved Resume" : "Generate Improved Resume"}
                  loading={improving}
                  onPress={improve}
                  testID="an-improve"
                />
              </Card>
              <Button
                title="Analyse Another"
                variant="outline"
                onPress={() => {
                  setAnalysis(null);
                  if (id) router.setParams({ id: undefined } as any);
                }}
                testID="an-reset"
              />
            </>
          ) : null}
        </KeyboardAwareScrollView>
      </ConsentGate>
    </View>
  );
}

function AnalysisResult({ res }: { res: any }) {
  const styles = useCareerStyles();
  const st = { ok: "success", warning: "warning", issue: "error" } as const;
  return (
    <View style={{ gap: 14 }} testID="an-result">
      <Card style={{ alignItems: "center", gap: 10 }}>
        <Text style={styles.h2}>A. Resume–JD Match Score (estimate)</Text>
        <ScoreRing score={res.match_score ?? 0} />
        <Text style={[styles.p, { textAlign: "center" }]}>{res.score_explanation}</Text>
        <View style={{ alignSelf: "stretch", gap: 6 }}>
          {(res.score_breakdown || []).map((b: any) => (
            <View key={b.factor} style={[styles.row, { justifyContent: "space-between" }]}>
              <Text style={styles.p}>{b.factor} ({b.weight}%)</Text>
              <Text style={styles.h2}>{b.score}/100</Text>
            </View>
          ))}
        </View>
        {res.limitations ? <Text style={styles.muted}>Limitations: {res.limitations}</Text> : null}
      </Card>

      <Card>
        <Text style={styles.h2}>B. Matching Skills</Text>
        <View style={{ gap: 6 }} testID="an-matching">
          {(res.matching_skills || []).map((m: any, i: number) => (
            <Text key={i} style={styles.p}>✓ {m.item || m}{m.evidence ? ` — ${m.evidence}` : ""}</Text>
          ))}
        </View>
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={styles.h2}>C. Missing or Unclear Skills</Text>
        <Text style={styles.muted}>
          “Missing” = not mentioned at all. “Unclear” = you may have it, but your resume does not show evidence — add it
          only if it is true.
        </Text>
        <View style={{ gap: 8 }} testID="an-missing">
          {(res.missing_skills || []).map((m: any, i: number) => (
            <View key={i} style={{ gap: 4 }}>
              <View style={styles.row}>
                <Badge label={m.status === "unclear" ? "Unclear" : "Missing"} color={m.status === "unclear" ? "warning" : "error"} />
                <Text style={[styles.p, { flex: 1, fontWeight: "700" }]}>{m.item}</Text>
              </View>
              {m.note ? <Text style={styles.muted}>{m.note}</Text> : null}
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={styles.h2}>D. Experience & Qualification Match</Text>
        {["summary", "experience", "education", "certifications"].map((k) =>
          res.experience_match?.[k] ? (
            <Text key={k} style={styles.p}>
              <Text style={{ fontWeight: "800" }}>{k[0].toUpperCase() + k.slice(1)}: </Text>
              {res.experience_match[k]}
            </Text>
          ) : null,
        )}
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={styles.h2}>E. Keyword Analysis</Text>
        <Text style={styles.label}>Missing from your resume</Text>
        <BulletList items={res.keyword_analysis?.missing} testID="an-kw-missing" />
        <Text style={[styles.label, { marginTop: 6 }]}>Already present</Text>
        <BulletList items={res.keyword_analysis?.present} />
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={styles.h2}>F. ATS Readiness Check</Text>
        {(res.ats_check || []).map((a: any, i: number) => (
          <View key={i} style={{ gap: 4 }}>
            <View style={styles.row}>
              <Badge label={(a.status || "ok").toUpperCase()} color={(st as any)[a.status] || "info"} />
              <Text style={[styles.p, { fontWeight: "700" }]}>{a.area}</Text>
            </View>
            <Text style={styles.muted}>{a.note}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={styles.h2}>G. Improvement Suggestions</Text>
        {[
          ["summary", "Professional summary"],
          ["skills", "Skills section"],
          ["experience", "Experience descriptions"],
          ["achievements", "Achievements"],
        ].map(([k, l]) => (
          <View key={k} style={{ gap: 4, marginTop: 4 }}>
            <Text style={styles.label}>{l}</Text>
            <BulletList items={res.suggestions?.[k]} />
          </View>
        ))}
      </Card>
      <AiDisclaimer text="The match score is an estimate based only on the text provided. Different companies use different ATS systems and criteria, so no tool can guarantee your resume will pass every ATS. Never add skills or experience you do not have." />
    </View>
  );
}
