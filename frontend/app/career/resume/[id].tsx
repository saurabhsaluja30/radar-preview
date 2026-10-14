import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUpIcon, ArrowDownIcon, TrashIcon, PlusIcon, WarningCircleIcon, XIcon } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Card, Chip, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme } from "@/src/theme";
import { NEW_ROLE_BLOCK, STYLES } from "@/src/resumeTemplates";
import { BulletList, downloadResume, formatErr, useCareerStyles, useInvalidateUsage, UsagePill, useCareerUsage } from "@/src/components/career";

type Sec = { id?: string; title: string; content: string; hint?: string };
const PERSONAL: [string, string][] = [
  ["full_name", "Full name *"],
  ["email", "Email *"],
  ["phone", "Phone *"],
  ["location", "City"],
  ["preferred_location", "Preferred job location"],
  ["linkedin", "LinkedIn (optional)"],
];

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

  const { data, isLoading, refetch } = useQuery({ queryKey: ["resume", id], queryFn: () => api(`/career/resumes/${id}`) });

  const [title, setTitle] = useState("");
  const [personal, setPersonal] = useState<any>({});
  const [sections, setSections] = useState<Sec[]>([]);
  const [template, setTemplate] = useState("classic");
  const [missing, setMissing] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [jd, setJd] = useState("");
  const [showTailor, setShowTailor] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    const r = data?.resume;
    if (r) {
      setTitle(r.title);
      setPersonal(r.personal || {});
      setSections(r.sections || []);
      setTemplate(r.template || "classic");
      setMissing(r.missing_fields || []);
      setDirty(false);
    }
  }, [data]);

  const edit = (fn: () => void) => {
    fn();
    setDirty(true);
  };
  const setSec = (i: number, patch: Partial<Sec>) =>
    edit(() => setSections((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x))));
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

  const addExperience = () =>
    edit(() =>
      setSections((arr) => {
        const i = arr.findIndex((s) => /EXPERIENCE/i.test(s.title));
        if (i === -1) return [...arr, { title: "WORK EXPERIENCE", content: NEW_ROLE_BLOCK }];
        return arr.map((s, j) => (j === i ? { ...s, content: (s.content ? s.content.trimEnd() + "\n\n" : "") + NEW_ROLE_BLOCK } : s));
      }),
    );

  const save = async (silent = false) => {
    setBusy("save");
    try {
      await api(`/career/resumes/${id}`, {
        method: "PUT",
        body: {
          title,
          resume_type: data.resume.resume_type,
          personal,
          sections,
          template,
          missing_fields: missing,
          target_job: data.resume.target_job || "",
        },
      });
      setDirty(false);
      await refetch();
      if (!silent) toast.show("Resume saved to your account", "success");
      return true;
    } catch (e) {
      toast.show(formatErr(e), "error");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const download = async (fmt: "pdf" | "docx") => {
    if (!personal.full_name?.trim()) return toast.show("Please add your full name before downloading", "error");
    if (dirty && !(await save(true))) return;
    setBusy(fmt);
    try {
      await downloadResume(id!, fmt);
      setShowDownload(false);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    if (dirty && !(await save(true))) return;
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
    if (dirty && !(await save(true))) return;
    setBusy("tailor");
    try {
      const res = await api<{ resume: any }>(`/career/resumes/${id}/tailor`, { method: "POST", body: { jd_text: jd } });
      await invalidate();
      toast.show("Customised version saved — review the suggested changes", "success");
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

  const notes: string[] = data.resume.notes || [];

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Review & Edit"
        right={
          <Pressable onPress={() => setShowPreview(true)} testID="re-preview-top">
            <Text style={{ color: colors.brandPrimary, fontWeight: "800" }}>Preview</Text>
          </Pressable>
        }
      />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 120 }}>
        {missing.length > 0 ? (
          <Card style={local.missingCard} testID="re-missing">
            <View style={styles.row}>
              <WarningCircleIcon size={20} color={colors.warning} weight="fill" />
              <Text style={[styles.h2, { marginBottom: 0, flex: 1 }]}>Please add these missing details</Text>
            </View>
            <Text style={styles.muted}>
              Everything else was filled in for you. Add only what is true, then tap ✕ when done.
            </Text>
            {missing.map((m, i) => (
              <View key={m + i} style={[styles.row, { justifyContent: "space-between" }]}>
                <Text style={[styles.p, { flex: 1 }]}>• {m}</Text>
                <Pressable onPress={() => edit(() => setMissing((a) => a.filter((_, j) => j !== i)))} hitSlop={8} testID={`re-missing-done-${i}`}>
                  <XIcon size={16} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        {notes.length > 0 ? (
          <Card style={{ gap: 6 }} testID="re-tailor-notes">
            <Text style={styles.h2}>Suggested changes for this job</Text>
            <BulletList items={notes} />
            <Text style={styles.muted}>Review each change — remove anything that does not reflect your real background.</Text>
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <Text style={styles.h2}>Template</Text>
          <View style={styles.chipWrap}>
            {STYLES.map((s) => (
              <Chip key={s.key} label={s.name} selected={template === s.key} onPress={() => edit(() => setTemplate(s.key))} testID={`re-style-${s.key}`} />
            ))}
          </View>
          <Text style={styles.muted}>All templates are single-column, ATS-friendly and use standard headings.</Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <Input label="Resume name (only you see this)" value={title} onChangeText={(v) => edit(() => setTitle(v))} testID="re-title" />
          {PERSONAL.map(([k, label]) => (
            <Input
              key={k}
              label={label}
              value={personal[k] || ""}
              autoCapitalize={["full_name", "location", "preferred_location"].includes(k) ? "words" : "none"}
              keyboardType={k === "email" ? "email-address" : k === "phone" ? "phone-pad" : "default"}
              onChangeText={(v) => edit(() => setPersonal((p: any) => ({ ...p, [k]: v })))}
              testID={`re-${k}`}
            />
          ))}
        </Card>

        <Text style={styles.muted}>
          Grey text in a box is guidance only and is never included in your resume. Start lines with “- ” for bullet
          points. Empty sections are left out of the download.
        </Text>

        {sections.map((s, i) => (
          <Card key={s.id || i} style={{ gap: 8 }} testID={`re-section-${i}`}>
            <View style={styles.row}>
              <TextInput
                value={s.title}
                onChangeText={(v) => setSec(i, { title: v })}
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
              <Pressable onPress={() => edit(() => setSections((arr) => arr.filter((_, j) => j !== i)))} hitSlop={8} style={local.iconBtn} testID={`re-remove-${i}`}>
                <TrashIcon size={18} color={colors.error} />
              </Pressable>
            </View>
            <TextInput
              multiline
              value={s.content}
              onChangeText={(v) => setSec(i, { content: v })}
              placeholder={s.hint || "Write this section"}
              placeholderTextColor={colors.muted}
              style={[styles.area, { minHeight: 110 }]}
              testID={`re-section-content-${i}`}
            />
          </Card>
        ))}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            title="Add Section"
            variant="outline"
            size="sm"
            fullWidth={false}
            style={{ flex: 1 }}
            icon={<PlusIcon size={16} color={colors.brandPrimary} />}
            onPress={() => edit(() => setSections((arr) => [...arr, { title: "NEW SECTION", content: "" }]))}
            testID="re-add-section"
          />
          <Button
            title="Add Work Experience"
            variant="outline"
            size="sm"
            fullWidth={false}
            style={{ flex: 1 }}
            icon={<PlusIcon size={16} color={colors.brandPrimary} />}
            onPress={addExperience}
            testID="re-add-experience"
          />
        </View>

        <Button title="Preview Resume" variant="secondary" onPress={() => setShowPreview(true)} testID="re-preview" />
        <Button title="Save as New Version" variant="ghost" loading={busy === "dup"} onPress={duplicate} testID="re-duplicate" />

        <Card style={{ gap: 10 }}>
          <Text style={styles.h2}>Customise My Resume for a Job (optional)</Text>
          <Text style={styles.muted}>
            Paste a job description and JobRadar will adjust your summary, skills and experience wording — only where
            your real background supports it. A new version is saved; this one stays unchanged.
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
              <Button title="Customise My Resume" loading={busy === "tailor"} onPress={tailor} testID="re-tailor-submit" />
            </>
          ) : (
            <Button title="Customise My Resume for a Job" variant="outline" onPress={() => setShowTailor(true)} testID="re-tailor-open" />
          )}
        </Card>
      </KeyboardAwareScrollView>

      <View style={[local.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Button title={dirty ? "Save Resume" : "Saved ✓"} variant="outline" fullWidth={false} style={{ flex: 1 }} loading={busy === "save"} disabled={!dirty} onPress={() => save()} testID="re-save" />
        <Button title="Download Resume" fullWidth={false} style={{ flex: 1 }} onPress={() => setShowDownload(true)} testID="re-download" />
      </View>

      <Modal visible={showDownload} transparent animationType="fade" onRequestClose={() => setShowDownload(false)}>
        <Pressable style={local.backdrop} onPress={() => setShowDownload(false)}>
          <Pressable style={local.sheet} onPress={() => {}}>
            <Text style={styles.h}>Download Resume</Text>
            <Text style={styles.muted}>Both formats contain selectable, ATS-readable text.</Text>
            <Button title="Download PDF" loading={busy === "pdf"} onPress={() => download("pdf")} testID="re-download-pdf" />
            <Button title="Download Word (DOCX)" variant="secondary" loading={busy === "docx"} onPress={() => download("docx")} testID="re-download-docx" />
            <Button title="Cancel" variant="ghost" onPress={() => setShowDownload(false)} testID="re-download-cancel" />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showPreview} animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={[styles.screen, { paddingTop: insets.top }]}>
          <View style={local.previewHeader}>
            <Text style={styles.h}>Preview</Text>
            <Pressable onPress={() => setShowPreview(false)} hitSlop={10} testID="re-preview-close">
              <XIcon size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 100 }}>
            <ResumePaper personal={personal} sections={sections} template={template} />
          </ScrollView>
          <View style={[local.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            <Button title="Edit" variant="outline" fullWidth={false} style={{ flex: 1 }} onPress={() => setShowPreview(false)} testID="re-preview-edit" />
            <Button
              title="Download"
              fullWidth={false}
              style={{ flex: 1 }}
              onPress={() => {
                setShowPreview(false);
                setShowDownload(true);
              }}
              testID="re-preview-download"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ResumePaper({ personal, sections, template }: { personal: any; sections: Sec[]; template: string }) {
  const local = useLocalStyles();
  const serif = template === "compact" ? Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }) : undefined;
  const accent = template === "modern" ? "#1F3A5F" : undefined; // fixed print color, same in light/dark
  const contact = [
    personal.email,
    personal.phone,
    personal.location,
    personal.preferred_location ? `Preferred location: ${personal.preferred_location}` : "",
    personal.linkedin,
  ].filter(Boolean);
  const visible = sections.filter((s) => s.content?.trim());
  return (
    <View style={local.paper} testID="re-paper">
      <Text style={[local.pName, { fontFamily: serif, color: accent || local.pName.color }]}>{personal.full_name || "Your Name"}</Text>
      {contact.length ? <Text style={[local.pContact, { fontFamily: serif }]}>{contact.join(" | ")}</Text> : null}
      {visible.map((s, i) => (
        <View key={s.id || i} style={{ marginTop: 12 }}>
          <Text style={[local.pHead, { fontFamily: serif, color: accent || local.pHead.color }, template !== "classic" && local.pRule]}>
            {s.title.toUpperCase()}
          </Text>
          {s.content.split("\n").filter((l) => l.trim()).map((l, j) => {
            const b = /^\s*[-•*]\s/.test(l);
            return (
              <Text key={j} style={[local.pBody, { fontFamily: serif }, b && { paddingLeft: 12 }]}>
                {b ? "• " + l.replace(/^\s*[-•*]\s/, "") : l}
              </Text>
            );
          })}
        </View>
      ))}
      {visible.length === 0 ? <Text style={local.pBody}>Your sections are empty — add your details to see them here.</Text> : null}
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
  missingCard: { gap: 8, borderColor: colors.warning, backgroundColor: colors.brandTertiary },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12, paddingBottom: 36 },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  paper: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 6, padding: 20 },
  pName: { color: "#111111", fontSize: 20, fontWeight: "800" },
  pContact: { color: "#444444", fontSize: 11, marginTop: 4 },
  pHead: { color: "#111111", fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginBottom: 4 },
  pRule: { borderBottomWidth: 1, borderBottomColor: "#999999", paddingBottom: 2 },
  pBody: { color: "#222222", fontSize: 12, lineHeight: 17 },
}));
