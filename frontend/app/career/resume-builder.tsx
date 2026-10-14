import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GraduationCapIcon, BriefcaseIcon, CheckCircleIcon } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { ScreenHeader } from "@/src/components/Brand";
import { Badge, Button, Card } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme } from "@/src/theme";
import { EXPERIENCED_BLANK, FRESHER_TEMPLATES, FresherTemplate, TemplateSection } from "@/src/resumeTemplates";
import {
  ConsentGate,
  UsagePill,
  formatErr,
  useCareerStyles,
  useCareerUsage,
  useInvalidateUsage,
} from "@/src/components/career";

type Step = "choose" | "fresher" | "experienced";

export default function ResumeBuilder() {
  const styles = useCareerStyles();
  const local = useLocal();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data: usage } = useCareerUsage();
  const invalidate = useInvalidateUsage();

  const [step, setStep] = useState<Step>("choose");
  const [preview, setPreview] = useState<string>("general");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Contact details come only from the candidate's own profile — never from sample content.
  const ownPersonal = {
    full_name: user?.full_name || "",
    email: user?.email || "",
    phone: (user as any)?.mobile || "",
    location: "",
    preferred_location: (user as any)?.preferred_location || "",
    linkedin: "",
  };

  const createFromTemplate = async (
    title: string,
    rtype: "fresher" | "experienced",
    sections: TemplateSection[],
    template: string,
  ) => {
    if (busy) return;
    setBusy(title);
    try {
      const res = await api<{ resume: any }>("/career/resumes", {
        method: "POST",
        body: {
          title,
          resume_type: rtype,
          template,
          personal: ownPersonal,
          // Sections start empty; guidance is kept as a hint (placeholder) only.
          sections: sections.map((s) => ({ title: s.title, content: "", hint: s.hint + (s.optional ? "\n(Optional — remove if not needed)" : "") })),
        },
      });
      router.replace(`/career/resume/${res.resume.resume_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const extract = async () => {
    if (busy) return;
    if (pasted.trim().length < 150) return toast.show("Please paste your complete resume text", "error");
    setBusy("extract");
    try {
      const res = await api<{ resume: any }>("/career/resumes/extract", { method: "POST", body: { resume_text: pasted } });
      await invalidate();
      toast.show("Resume auto-filled — please review every section", "success");
      router.replace(`/career/resume/${res.resume.resume_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const back = step === "choose" ? undefined : (
    <Pressable onPress={() => setStep("choose")} hitSlop={8} testID="rb-change-type">
      <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 13 }}>Change type</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="ATS Resume Builder" right={back} />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        {step === "choose" && (
          <>
            <Text style={styles.h}>Choose your resume type</Text>
            <TypeCard
              icon={<GraduationCapIcon size={30} color={colors.brandPrimary} weight="fill" />}
              title="Fresher Resume"
              desc="For students, recent graduates and candidates with no full-time work experience. Start from a ready-made template."
              button="Create Fresher Resume"
              onPress={() => setStep("fresher")}
              testID="rb-type-fresher"
            />
            <TypeCard
              icon={<BriefcaseIcon size={30} color={colors.brandPrimary} weight="fill" />}
              title="Experienced Resume"
              desc="For candidates who have worked previously or are currently employed. Paste your existing resume and we auto-fill it."
              button="Create Experienced Resume"
              onPress={() => setStep("experienced")}
              testID="rb-type-experienced"
            />
          </>
        )}

        {step === "fresher" && (
          <>
            <Text style={styles.h}>Pick a template to start</Text>
            <Text style={styles.muted}>
              All templates are single-column and ATS-friendly. Sample text is a placeholder only — it is never added to
              your resume.
            </Text>
            {FRESHER_TEMPLATES.map((t) => (
              <Card key={t.key} style={[{ gap: 10 }, preview === t.key && local.selected]} testID={`rb-template-${t.key}`}>
                <Pressable onPress={() => setPreview(t.key)} style={{ gap: 4 }}>
                  <View style={styles.row}>
                    <Text style={[styles.h2, { flex: 1, marginBottom: 0 }]}>{t.name}</Text>
                    {preview === t.key ? <CheckCircleIcon size={22} color={colors.brandPrimary} weight="fill" /> : null}
                  </View>
                  <Text style={styles.muted}>{t.desc}</Text>
                </Pressable>
                {preview === t.key ? <SamplePreview t={t} /> : (
                  <Button title="Preview" variant="ghost" size="sm" onPress={() => setPreview(t.key)} testID={`rb-preview-${t.key}`} />
                )}
                {preview === t.key ? (
                  <Button
                    title="Use This Template"
                    loading={busy === t.name}
                    onPress={() => createFromTemplate(`${t.name} Resume`, "fresher", t.sections, t.style)}
                    testID={`rb-use-${t.key}`}
                  />
                ) : null}
              </Card>
            ))}
          </>
        )}

        {step === "experienced" && (
          <ConsentGate>
            <View style={{ gap: 14 }}>
              <Text style={styles.h}>Create Your Resume in Minutes</Text>
              <Text style={styles.p}>
                Copy and paste your existing resume below. JobRadar will extract the information and organise it into a
                professional, ATS-friendly format.
              </Text>
              <View>
                <Text style={styles.label}>Paste Your Existing Resume</Text>
                <TextInput
                  multiline
                  value={pasted}
                  onChangeText={setPasted}
                  placeholder="Copy your current resume from Word, PDF text or another document and paste it here..."
                  placeholderTextColor={colors.muted}
                  style={[styles.area, { minHeight: 260 }]}
                  maxLength={15000}
                  testID="rb-paste"
                />
                <Text style={[styles.muted, { marginTop: 4 }]}>{pasted.length.toLocaleString()} / 15,000 characters</Text>
              </View>
              <UsagePill tool="resume_builder" usage={usage} />
              <Button title="Analyse & Auto-Fill Resume" loading={busy === "extract"} onPress={extract} testID="rb-extract" />
              {busy === "extract" ? (
                <Text style={styles.muted}>Reading your resume and organising sections… this takes about 20–40 seconds.</Text>
              ) : null}
              <Text style={styles.muted}>
                We only use what you paste. Nothing is invented — anything missing or unclear will be listed for you to
                fill in.
              </Text>
              <Button
                title="No resume to paste? Start from a blank template"
                variant="ghost"
                size="sm"
                loading={busy === "Experienced Resume"}
                onPress={() => createFromTemplate("Experienced Resume", "experienced", EXPERIENCED_BLANK, "classic")}
                testID="rb-exp-blank"
              />
            </View>
          </ConsentGate>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function TypeCard({ icon, title, desc, button, onPress, testID }: any) {
  const styles = useCareerStyles();
  const local = useLocal();
  return (
    <Card style={{ gap: 12, paddingVertical: 22 }} testID={testID}>
      <View style={local.bigIcon}>{icon}</View>
      <Text style={[styles.h, { fontSize: 20 }]}>{title}</Text>
      <Text style={styles.p}>{desc}</Text>
      <Button title={button} size="lg" onPress={onPress} testID={`${testID}-btn`} />
    </Card>
  );
}

function SamplePreview({ t }: { t: FresherTemplate }) {
  const local = useLocal();
  return (
    <View style={local.paper} testID={`rb-sample-${t.key}`}>
      <Badge label="SAMPLE — placeholder content" color="warning" />
      <Text style={local.pName}>{t.sample.name}</Text>
      <Text style={local.pContact}>{t.sample.contact}</Text>
      {t.sample.sections.map((s) => (
        <View key={s.title} style={{ marginTop: 8 }}>
          <Text style={local.pHead}>{s.title}</Text>
          <Text style={local.pBody}>{s.content}</Text>
        </View>
      ))}
    </View>
  );
}

const useLocal = makeStyles((colors) => ({
  selected: { borderColor: colors.brandPrimary, borderWidth: 2 },
  bigIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  paper: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, padding: 14, gap: 2 },
  pName: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: 8 },
  pContact: { color: colors.muted, fontSize: 11 },
  pHead: { color: colors.onSurface, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: 2 },
  pBody: { color: colors.onSurfaceSecondary, fontSize: 11, lineHeight: 16, marginTop: 2 },
}));
