import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUpIcon, ArrowDownIcon, TrashIcon, PlusIcon } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Card, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme } from "@/src/theme";
import { downloadResume, formatErr, useCareerStyles, useInvalidateUsage, UsagePill, useCareerUsage } from "@/src/components/career";

type Sec = { id?: string; title: string; content: string };

export default function ResumeEditor() {
  const styles = useCareerStyles();
  const local = useLocalStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateUsage();
  const { data: usage } = useCareerUsage();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["resume", id],
    queryFn: () => api(`/career/resumes/${id}`),
  });

  const [title, setTitle] = useState("");
  const [personal, setPersonal] = useState<any>({});
  const [sections, setSections] = useState<Sec[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [jd, setJd] = useState("");
  const [showTailor, setShowTailor] = useState(false);

  useEffect(() => {
    const r = data?.resume;
    if (r) {
      setTitle(r.title);
      setPersonal(r.personal || {});
      setSections(r.sections || []);
      setDirty(false);
    }
  }, [data]);

  const edit = (fn: () => void) => {
    fn();
    setDirty(true);
  };
  const move = (i: number, d: number) =>
    edit(() =>
      setSections((s) => {
        const n = [...s];
        const j = i + d;
        if (j < 0 || j >= n.length) return s;
        [n[i], n[j]] = [n[j], n[i]];
        return n;
      }),
    );

  const save = async () => {
    setBusy("save");
    try {
      await api(`/career/resumes/${id}`, {
        method: "PUT",
        body: { title, resume_type: data.resume.resume_type, personal, sections, target_job: data.resume.target_job || "" },
      });
      setDirty(false);
      await refetch();
      toast.show("Resume saved", "success");
      return true;
    } catch (e) {
      toast.show(formatErr(e), "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const download = async (fmt: "pdf" | "docx") => {
    if (dirty && !(await save())) return;
    setBusy(fmt);
    try {
      await downloadResume(id!, fmt);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    setBusy("dup");
    try {
      const res = await api<{ resume: any }>(`/career/resumes/${id}/duplicate`, { method: "POST" });
      toast.show("New version created", "success");
      router.replace(`/career/resume/${res.resume.resume_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const tailor = async () => {
    if (dirty && !(await save())) return;
    setBusy("tailor");
    try {
      const res = await api<{ resume: any }>(`/career/resumes/${id}/tailor`, { method: "POST", body: { jd_text: jd } });
      await invalidate();
      toast.show("Tailored version saved as a new resume", "success");
      router.replace(`/career/resume/${res.resume.resume_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Resume" />
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Edit Resume"
        right={
          <Pressable onPress={save} disabled={!dirty || !!busy} testID="re-save-top">
            <Text style={{ color: dirty ? colors.brandPrimary : colors.muted, fontWeight: "800" }}>Save</Text>
          </Pressable>
        }
      />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        <Card style={{ gap: 12 }}>
          <Input label="Resume name" value={title} onChangeText={(v) => edit(() => setTitle(v))} testID="re-title" />
          {(["full_name", "email", "phone", "location", "linkedin"] as const).map((k) => (
            <Input
              key={k}
              label={{ full_name: "Full name", email: "Email", phone: "Phone", location: "Location", linkedin: "LinkedIn" }[k]}
              value={personal[k] || ""}
              autoCapitalize={k === "full_name" || k === "location" ? "words" : "none"}
              onChangeText={(v) => edit(() => setPersonal((p: any) => ({ ...p, [k]: v })))}
              testID={`re-${k}`}
            />
          ))}
        </Card>

        <Text style={styles.muted}>
          Single-column ATS template with standard headings. Start lines with “- ” for bullet points. Use the arrows to
          rearrange sections.
        </Text>

        {sections.map((s, i) => (
          <Card key={s.id || i} style={{ gap: 8 }} testID={`re-section-${i}`}>
            <View style={styles.row}>
              <TextInput
                value={s.title}
                onChangeText={(v) => edit(() => setSections((arr) => arr.map((x, j) => (j === i ? { ...x, title: v } : x))))}
                style={local.secTitle}
                placeholder="SECTION HEADING"
                placeholderTextColor={colors.muted}
                testID={`re-section-title-${i}`}
              />
              <Pressable onPress={() => move(i, -1)} hitSlop={8} style={local.iconBtn} testID={`re-up-${i}`}>
                <ArrowUpIcon size={18} color={colors.brandPrimary} />
              </Pressable>
              <Pressable onPress={() => move(i, 1)} hitSlop={8} style={local.iconBtn} testID={`re-down-${i}`}>
                <ArrowDownIcon size={18} color={colors.brandPrimary} />
              </Pressable>
              <Pressable
                onPress={() => edit(() => setSections((arr) => arr.filter((_, j) => j !== i)))}
                hitSlop={8}
                style={local.iconBtn}
                testID={`re-remove-${i}`}
              >
                <TrashIcon size={18} color={colors.error} />
              </Pressable>
            </View>
            <TextInput
              multiline
              value={s.content}
              onChangeText={(v) => edit(() => setSections((arr) => arr.map((x, j) => (j === i ? { ...x, content: v } : x))))}
              style={[styles.area, { minHeight: 110 }]}
              testID={`re-section-content-${i}`}
            />
          </Card>
        ))}

        <Button
          title="Add Section"
          variant="outline"
          icon={<PlusIcon size={16} color={colors.brandPrimary} />}
          onPress={() => edit(() => setSections((arr) => [...arr, { title: "NEW SECTION", content: "" }]))}
          testID="re-add-section"
        />
        <Button title="Save Changes" onPress={save} loading={busy === "save"} disabled={!dirty} testID="re-save" />

        <Card style={{ gap: 10 }}>
          <Text style={styles.h2}>Download</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button title="PDF" fullWidth={false} style={{ flex: 1 }} loading={busy === "pdf"} onPress={() => download("pdf")} testID="re-download-pdf" />
            <Button title="DOCX" variant="secondary" fullWidth={false} style={{ flex: 1 }} loading={busy === "docx"} onPress={() => download("docx")} testID="re-download-docx" />
          </View>
          <Button title="Save as New Version" variant="ghost" loading={busy === "dup"} onPress={duplicate} testID="re-duplicate" />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={styles.h2}>Improve for a specific job</Text>
          <Text style={styles.muted}>
            Paste a job description and AI will reorder and reword your resume to match — using only your genuine
            details. A new version is saved; this one stays unchanged.
          </Text>
          {showTailor ? (
            <>
              <TextInput
                multiline
                value={jd}
                onChangeText={setJd}
                placeholder="Paste the complete job description"
                placeholderTextColor={colors.muted}
                style={[styles.area, { minHeight: 140 }]}
                maxLength={12000}
                testID="re-tailor-jd"
              />
              <UsagePill tool="resume_builder" usage={usage} />
              <Button title="Tailor My Resume" loading={busy === "tailor"} onPress={tailor} testID="re-tailor-submit" />
            </>
          ) : (
            <Button title="Tailor to a Job Description" variant="outline" onPress={() => setShowTailor(true)} testID="re-tailor-open" />
          )}
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useLocalStyles = makeStyles((colors) => ({
  secTitle: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.surfaceSecondary },
}));
