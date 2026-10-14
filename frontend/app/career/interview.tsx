import React, { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Card, Chip, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import {
  AiDisclaimer,
  ConsentGate,
  UsagePill,
  formatErr,
  useCareerStyles,
  useCareerUsage,
  useInvalidateUsage,
} from "@/src/components/career";

const LEVELS = ["Fresher", "0-2 years", "3-5 years", "6-10 years", "10+ years"];
const TYPES = [
  "HR Interview",
  "Technical Interview",
  "Functional/Role-Specific Interview",
  "Managerial Interview",
  "Behavioural Interview",
  "Complete Mock Interview",
];
const DIFFS = ["Beginner", "Intermediate", "Advanced"];

export default function InterviewSetup() {
  const styles = useCareerStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const { data: usage } = useCareerUsage();
  const invalidate = useInvalidateUsage();

  const [form, setForm] = useState({
    job_title: "",
    company: "",
    jd_text: "",
    industry: "",
    experience_level: "",
    interview_type: "",
    difficulty: "Intermediate",
    num_questions: 5,
    feedback_mode: "each",
  });
  const [prefillNote, setPrefillNote] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!jobId) return;
    api(`/career/job-prefill/${jobId}`)
      .then((p) => {
        setForm((f) => ({ ...f, job_title: p.job_title || "", company: p.company || "", industry: p.industry || "", jd_text: p.jd_text || "" }));
        setPrefillNote(
          p.full_jd
            ? `Pre-filled from JobRadar listing${p.experience_required ? ` · Experience: ${p.experience_required}` : ""}. Now choose the interview type.`
            : "Pre-filled with the public job preview. Members get the full job description — you can also paste it below.",
        );
      })
      .catch(() => {});
  }, [jobId]);

  const start = async () => {
    if (loading) return;
    if (!form.experience_level || !form.interview_type) return toast.show("Select experience level and interview type", "error");
    setLoading(true);
    try {
      const r = await api("/career/interviews", { method: "POST", body: { ...form, job_id: jobId || null } });
      await invalidate();
      router.replace(`/career/interview/${r.session.session_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const ChipGroup = ({ k, options }: { k: string; options: (string | number)[] }) => (
    <View style={styles.chipWrap}>
      {options.map((o) => (
        <Chip key={String(o)} label={String(o)} selected={(form as any)[k] === o} onPress={() => set(k, o)} testID={`iv-${k}-${o}`} />
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="AI Interview Coach" />
      <ConsentGate>
        <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>
          {prefillNote ? (
            <Card testID="iv-prefill-note"><Text style={styles.p}>{prefillNote}</Text></Card>
          ) : null}
          <Card style={{ gap: 12 }}>
            <Text style={styles.h}>Interview setup</Text>
            <Input label="Target job title / designation *" value={form.job_title} onChangeText={(v) => set("job_title", v)} testID="iv-title" />
            <Input label="Company name (optional)" value={form.company} onChangeText={(v) => set("company", v)} testID="iv-company" />
            <View>
              <Text style={styles.label}>Job description *</Text>
              <TextInput
                multiline
                value={form.jd_text}
                onChangeText={(v) => set("jd_text", v)}
                placeholder="Paste the job description"
                placeholderTextColor={colors.muted}
                style={[styles.area, { minHeight: 140 }]}
                maxLength={12000}
                testID="iv-jd"
              />
            </View>
          </Card>
          <Card style={{ gap: 10 }}>
            <Text style={styles.label}>Experience level *</Text>
            <ChipGroup k="experience_level" options={LEVELS} />
            <Text style={styles.label}>Interview type *</Text>
            <ChipGroup k="interview_type" options={TYPES} />
            <Text style={styles.label}>Difficulty</Text>
            <ChipGroup k="difficulty" options={DIFFS} />
            <Text style={styles.label}>Number of questions</Text>
            <ChipGroup k="num_questions" options={[5, 10, 15]} />
            <Text style={styles.label}>Feedback</Text>
            <View style={styles.chipWrap}>
              <Chip label="After every answer" selected={form.feedback_mode === "each"} onPress={() => set("feedback_mode", "each")} testID="iv-fb-each" />
              <Chip label="Full report at the end" selected={form.feedback_mode === "end"} onPress={() => set("feedback_mode", "end")} testID="iv-fb-end" />
            </View>
          </Card>
          <UsagePill tool="interview_coach" usage={usage} />
          <Button title="Start Interview Practice" loading={loading} onPress={start} testID="iv-start" />
          {loading ? <Text style={styles.muted}>Preparing role-specific questions…</Text> : null}
          <Button title="View Past Sessions" variant="ghost" onPress={() => router.push("/career/history?tab=interviews" as any)} testID="iv-history" />
          <AiDisclaimer />
        </KeyboardAwareScrollView>
      </ConsentGate>
    </View>
  );
}
