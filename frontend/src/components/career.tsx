// Shared Career Tools building blocks: usage hook, consent gate, cards, lists, download helper.
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileTextIcon,
  TargetIcon,
  ChatsCircleIcon,
  ShieldCheckIcon,
  CaretRightIcon,
} from "phosphor-react-native";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Card } from "@/src/components/ui";

export type ToolKey = "resume_builder" | "resume_analyser" | "interview_coach";
export const TOOL_KIND: Record<ToolKey, string> = {
  resume_builder: "resume_generation",
  resume_analyser: "resume_analysis",
  interview_coach: "interview_sessions",
};
const KIND_LABEL: Record<string, string> = {
  resume_generation: "AI resume generations",
  resume_analysis: "resume analyses",
  interview_sessions: "interview sessions",
};

export function useCareerUsage() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["career-usage", user?.user_id],
    queryFn: () => api("/career/usage"),
    enabled: !!user && user.role === "candidate",
  });
}

export function useInvalidateUsage() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["career-usage"] });
}

/** Shows remaining usage for a tool, or the reason it is locked. */
export function UsagePill({ tool, usage }: { tool: ToolKey; usage: any }) {
  const styles = useStyles();
  if (!usage) return null;
  const u = usage.usage?.[TOOL_KIND[tool]];
  const t = usage.tools?.[tool];
  if (t && !t.accessible) {
    return <Text style={[styles.pill, styles.pillWarn]} testID={`usage-${tool}`}>{t.reason}</Text>;
  }
  return (
    <Text style={styles.pill} testID={`usage-${tool}`}>
      {u?.remaining ?? 0} of {u?.limit ?? 0} {KIND_LABEL[TOOL_KIND[tool]]} left · {usage.period_label || `resets every ${usage.period_days} days`}
    </Text>
  );
}

/** Blocks AI tools until the candidate accepts AI processing consent. */
export function ConsentGate({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data, isLoading } = useCareerUsage();
  const invalidate = useInvalidateUsage();
  const [saving, setSaving] = React.useState(false);
  if (isLoading || !data) return <>{children}</>;
  if (!data.ai_configured) {
    return (
      <Card style={{ margin: 16 }} testID="ai-not-configured">
        <Text style={styles.h}>AI service not configured</Text>
        <Text style={styles.p}>
          The AI provider is not configured on the server, so Career Tools cannot run right now. Please contact
          support.
        </Text>
      </Card>
    );
  }
  if (data.ai_consent) return <>{children}</>;
  return (
    <Card style={{ margin: 16, gap: 12 }} testID="ai-consent-card">
      <ShieldCheckIcon size={28} color={colors.brandPrimary} weight="fill" />
      <Text style={styles.h}>Before you start: AI processing & privacy</Text>
      <Text style={styles.p}>
        Career Tools send the text you enter (resume details, job descriptions and interview answers) securely from
        our server to an AI provider to generate results. Your resumes, reports and answers are private to your
        account — never shown to other candidates — and you can delete them at any time.
      </Text>
      <Text style={styles.p}>
        AI results are estimates for guidance only and never guarantee shortlisting, interviews or employment. Only
        enter information that is true about you.
      </Text>
      <Button
        title="I Agree — Continue"
        loading={saving}
        testID="ai-consent-accept"
        onPress={async () => {
          setSaving(true);
          try {
            await api("/career/consent", { method: "POST" });
            await invalidate();
          } finally {
            setSaving(false);
          }
        }}
      />
    </Card>
  );
}

export function AiDisclaimer({ text }: { text?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.disc} testID="ai-disclaimer">
      <Text style={styles.discTxt}>
        {text ||
          "AI-generated scores and suggestions are estimates for practice and guidance only. They are not an official employer assessment and do not guarantee ATS success, interviews or employment."}
      </Text>
    </View>
  );
}

const TOOLS: { key: ToolKey; title: string; desc: string; to: string; Icon: any }[] = [
  {
    key: "resume_builder",
    title: "ATS Resume Builder",
    desc: "Create a professional, ATS-friendly resume for fresher or experienced roles.",
    to: "/career/resume-builder",
    Icon: FileTextIcon,
  },
  {
    key: "resume_analyser",
    title: "Resume Analyser",
    desc: "Compare your resume against a job description and get a match score.",
    to: "/career/analyser",
    Icon: TargetIcon,
  },
  {
    key: "interview_coach",
    title: "AI Interview Coach",
    desc: "Practise role-specific interviews and receive instant feedback.",
    to: "/career/interview",
    Icon: ChatsCircleIcon,
  },
];

export function CareerToolsCards({ showHub = true }: { showHub?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { data } = useCareerUsage();
  return (
    <View style={{ gap: 12 }} testID="career-tools-cards">
      {TOOLS.map(({ key, title, desc, to, Icon }) => (
        <Card key={key} style={{ gap: 10 }} testID={`career-card-${key}`}>
          <View style={styles.cardRow}>
            <View style={styles.iconWrap}>
              <Icon size={22} color={colors.brandPrimary} weight="fill" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.p}>{desc}</Text>
            </View>
          </View>
          <UsagePill tool={key} usage={data} />
          <Button title="Start Now" size="sm" onPress={() => router.push(to as any)} testID={`career-start-${key}`} />
        </Card>
      ))}
      {showHub ? (
        <Pressable style={styles.hubLink} onPress={() => router.push("/career/history")} testID="career-history-link">
          <Text style={styles.hubTxt}>My saved resumes, reports & interviews</Text>
          <CaretRightIcon size={16} color={colors.brandPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function BulletList({ items, testID }: { items?: any[]; testID?: string }) {
  const styles = useStyles();
  if (!items || items.length === 0) return <Text style={styles.p}>—</Text>;
  return (
    <View style={{ gap: 6 }} testID={testID}>
      {items.map((it, i) => (
        <Text key={i} style={styles.p}>
          • {typeof it === "string" ? it : it?.item || JSON.stringify(it)}
        </Text>
      ))}
    </View>
  );
}

export function ScoreRing({ score, label }: { score: number; label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const c = score >= 70 ? colors.success : score >= 45 ? colors.warning : colors.error;
  return (
    <View style={{ alignItems: "center", gap: 4 }} testID="score-ring">
      <View style={[styles.ring, { borderColor: c }]}>
        <Text style={[styles.ringTxt, { color: c }]}>{score}</Text>
        <Text style={styles.ringSub}>/100</Text>
      </View>
      {label ? <Text style={styles.ringLabel}>{label}</Text> : null}
    </View>
  );
}

export async function downloadResume(resumeId: string, format: "pdf" | "docx") {
  const res = await api<{ path: string }>(`/career/resumes/${resumeId}/download-link`, {
    method: "POST",
    body: { format },
  });
  const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}${res.path}`;
  if (Platform.OS === "web") {
    window.open(url, "_blank");
  } else {
    await Linking.openURL(url);
  }
}

export const formatErr = (e: any) => e?.message || "Something went wrong. Please try again.";

export const useCareerStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  h2: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginBottom: 6 },
  p: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: { color: colors.onSurface, fontSize: 13, fontWeight: "700", marginBottom: 6 },
  area: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: colors.onSurface,
    textAlignVertical: "top",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
}));

const useStyles = makeStyles((colors) => ({
  h: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  p: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  pill: {
    color: colors.onSurfaceTertiary,
    backgroundColor: colors.surfaceTertiary,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  pillWarn: { color: colors.warning, backgroundColor: colors.brandTertiary },
  disc: { backgroundColor: colors.brandTertiary, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
  discTxt: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  cardRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginBottom: 2 },
  hubLink: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 4 },
  hubTxt: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  ring: { width: 96, height: 96, borderRadius: 48, borderWidth: 6, alignItems: "center", justifyContent: "center" },
  ringTxt: { fontSize: 28, fontWeight: "900" },
  ringSub: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  ringLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
}));
