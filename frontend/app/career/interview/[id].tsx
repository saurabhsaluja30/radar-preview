import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Badge, Button, Card } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import { AiDisclaimer, BulletList, ScoreRing, formatErr, useCareerStyles } from "@/src/components/career";

const DIMS: [string, string][] = [
  ["relevance", "Relevance"],
  ["role_knowledge", "Role knowledge"],
  ["structure_clarity", "Structure & clarity"],
  ["specific_examples", "Specific examples"],
  ["communication", "Communication"],
  ["completeness", "Completeness"],
];

export default function InterviewSession() {
  const styles = useCareerStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, refetch } = useQuery({ queryKey: ["interview", id], queryFn: () => api(`/career/interviews/${id}`) });

  const [session, setSession] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showFeedbackFor, setShowFeedbackFor] = useState<number | null>(null);

  useEffect(() => {
    if (data?.session) {
      setSession(data.session);
      const next = data.session.questions.findIndex((q: any) => q.status === "pending");
      setIdx(next === -1 ? data.session.questions.length : next);
    }
  }, [data]);

  if (!session) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Interview" />
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const total = session.questions.length;
  const done = session.status !== "in_progress";

  const call = async (key: string, fn: () => Promise<any>) => {
    if (busy) return;
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const goNext = (s: any) => {
    setSession(s);
    setAnswer("");
    setHint(null);
    const next = s.questions.findIndex((q: any) => q.status === "pending");
    if (s.feedback_mode === "each" && s.questions[idx]?.feedback && s.questions[idx].status === "answered") {
      setShowFeedbackFor(idx);
    } else {
      setShowFeedbackFor(null);
    }
    setIdx(next === -1 ? total : next);
  };

  const submit = () =>
    call("submit", async () => {
      const r = await api(`/career/interviews/${id}/answer`, { method: "POST", body: { index: idx, answer } });
      goNext(r.session);
    });
  const skip = () =>
    call("skip", async () => {
      const r = await api(`/career/interviews/${id}/skip`, { method: "POST", body: { index: idx } });
      goNext(r.session);
    });
  const getHint = () =>
    call("hint", async () => {
      const r = await api(`/career/interviews/${id}/hint`, { method: "POST", body: { index: idx } });
      setHint(r.hint);
    });
  const endNow = () =>
    call("end", async () => {
      const r = await api(`/career/interviews/${id}/end`, { method: "POST" });
      setSession(r.session);
      setShowFeedbackFor(null);
      await refetch();
    });

  const q = session.questions[idx];
  const fbQ = showFeedbackFor !== null ? session.questions[showFeedbackFor] : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={done ? "Interview Report" : `Question ${Math.min(idx + 1, total)} of ${total}`} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.muted}>
          {session.job_title}
          {session.company ? ` · ${session.company}` : ""} · {session.interview_type} · {session.difficulty}
        </Text>

        {fbQ?.feedback ? <FeedbackCard q={fbQ} index={showFeedbackFor!} /> : null}

        {done ? (
          <Report session={session} />
        ) : q ? (
          <Card style={{ gap: 12 }} testID="iv-question-card">
            <Badge label={q.category || "Question"} color="brand" />
            <Text style={styles.h} testID="iv-question-text">{q.question}</Text>
            {hint ? (
              <View style={{ backgroundColor: colors.brandTertiary, padding: 12, borderRadius: 12 }} testID="iv-hint">
                <Text style={styles.p}>💡 {hint}</Text>
              </View>
            ) : null}
            <TextInput
              multiline
              value={answer}
              onChangeText={setAnswer}
              placeholder="Type your answer here. Use real examples from your own experience."
              placeholderTextColor={colors.muted}
              style={[styles.area, { minHeight: 160 }]}
              maxLength={5000}
              testID="iv-answer"
            />
            <Button title="Submit Answer" loading={busy === "submit"} disabled={!!busy || answer.trim().length < 5} onPress={submit} testID="iv-submit" />
            {busy === "submit" && session.feedback_mode === "each" ? <Text style={styles.muted}>Evaluating your answer…</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Get Hint" variant="outline" size="sm" fullWidth={false} style={{ flex: 1 }} loading={busy === "hint"} disabled={!!busy} onPress={getHint} testID="iv-hint-btn" />
              <Button title="Skip Question" variant="outline" size="sm" fullWidth={false} style={{ flex: 1 }} loading={busy === "skip"} disabled={!!busy} onPress={skip} testID="iv-skip" />
            </View>
            <Button title="End Interview" variant="ghost" loading={busy === "end"} disabled={!!busy} onPress={endNow} testID="iv-end" />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={styles.h}>All questions completed 🎉</Text>
            <Text style={styles.p}>Generate your personalised interview report.</Text>
            <Button title="View Final Report" loading={busy === "end"} onPress={endNow} testID="iv-finish" />
            {busy === "end" ? <Text style={styles.muted}>Preparing your report…</Text> : null}
          </Card>
        )}

        {done ? (
          <Button title="Start a New Practice Session" variant="outline" onPress={() => router.replace("/career/interview" as any)} testID="iv-new" />
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

function FeedbackCard({ q, index }: { q: any; index: number }) {
  const styles = useCareerStyles();
  const f = q.feedback;
  return (
    <Card style={{ gap: 10 }} testID="iv-feedback">
      <Text style={styles.h2}>Feedback on Q{index + 1}</Text>
      <View style={[styles.row, { gap: 16 }]}>
        <ScoreRing score={f.score ?? 0} />
        <View style={{ flex: 1, gap: 2 }}>
          {f.dimensions
            ? DIMS.map(([k, l]) => (
                <Text key={k} style={styles.muted}>
                  {l}: {f.dimensions[k] ?? "—"}/10
                </Text>
              ))
            : null}
        </View>
      </View>
      <Text style={styles.label}>What you did well</Text>
      <BulletList items={f.did_well} />
      {f.missing ? (
        <>
          <Text style={styles.label}>What was missing</Text>
          <BulletList items={f.missing} />
        </>
      ) : null}
      <Text style={styles.label}>How to improve</Text>
      <BulletList items={f.how_to_improve} />
      {f.star_tip ? <Text style={styles.p}>⭐ STAR tip: {f.star_tip}</Text> : null}
      {f.stronger_structure ? (
        <>
          <Text style={styles.label}>EXAMPLE — stronger answer structure (template only)</Text>
          <Text style={styles.p}>{f.stronger_structure}</Text>
        </>
      ) : null}
      {f.follow_up ? <Text style={styles.p}>Follow-up question: {f.follow_up}</Text> : null}
    </Card>
  );
}

function Report({ session }: { session: any }) {
  const styles = useCareerStyles();
  const r = session.report || {};
  if (r.empty) {
    return (
      <Card><Text style={styles.p}>{r.summary}</Text></Card>
    );
  }
  const list: [string, string][] = [
    ["strengths", "Strengths"],
    ["areas_for_improvement", "Areas for improvement"],
    ["knowledge_gaps", "Knowledge gaps identified"],
    ["answered_well", "Questions answered well"],
    ["needs_preparation", "Questions requiring more preparation"],
    ["topics_to_study", "Suggested topics to study"],
    ["practice_questions", "Recommended practice questions"],
    ["preparation_plan", "Your personalised preparation plan"],
  ];
  return (
    <View style={{ gap: 14 }} testID="iv-report">
      <Card style={{ alignItems: "center", gap: 10 }}>
        <ScoreRing score={r.overall_score ?? 0} label="Overall performance (estimate)" />
        {r.summary ? <Text style={[styles.p, { textAlign: "center" }]}>{r.summary}</Text> : null}
      </Card>
      <Card style={{ gap: 6 }}>
        <Text style={styles.h2}>Individual question scores</Text>
        {session.questions.map((q: any, i: number) => (
          <View key={i} style={[styles.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
            <Text style={[styles.p, { flex: 1 }]} numberOfLines={2}>Q{i + 1}. {q.question}</Text>
            <Text style={styles.h2}>{q.status === "answered" ? `${q.feedback?.score ?? "—"}` : "Skipped"}</Text>
          </View>
        ))}
      </Card>
      {r.communication_feedback ? (
        <Card>
          <Text style={styles.h2}>Communication & answer structure</Text>
          <Text style={styles.p}>{r.communication_feedback}</Text>
        </Card>
      ) : null}
      {list.map(([k, l]) =>
        r[k]?.length ? (
          <Card key={k}>
            <Text style={styles.h2}>{l}</Text>
            <BulletList items={r[k]} />
          </Card>
        ) : null,
      )}
      <AiDisclaimer text={r.disclaimer} />
    </View>
  );
}
