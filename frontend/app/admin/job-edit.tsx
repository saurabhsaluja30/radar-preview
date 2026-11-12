import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Input, Chip } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { CATEGORIES, WORK_MODES, JOB_STATUSES, INDUSTRIES_WITH_OTHER, INDUSTRY_SHORT, REGIONS, CURRENCIES } from "@/src/constants";

const EMPTY: any = {
  title: "", company: "", function: "", industry_category: "", sub_function: "", industry: "",
  designation: "", region: "India", location: "", city: "", country: "India", currency: "INR",
  visa_info: "", work_mode: "Work From Office", experience_required: "", salary_range: "",
  employment_type: "Full-time", description: "", key_responsibilities: "", required_skills: "",
  preferred_skills: "", recruiter_name: "", recruiter_email: "", application_link: "",
  source_link: "", application_deadline: "", status: "Published", featured: false,
  verification_score: 80, admin_notes: "",
};

const TEXT_FIELDS: [string, string, boolean?][] = [
  ["title", "Job Title *"],
  ["company", "Company Name *"],
  ["sub_function", "Sub-function"],
  ["industry", "Industry (sector, e.g. IT Services)"],
  ["designation", "Designation"],
  ["location", "Location / Area"],
  ["city", "City"],
  ["country", "Country"],
  ["visa_info", "Work Authorization / Visa Info", true],
  ["experience_required", "Experience Required"],
  ["salary_range", "Salary Range"],
  ["employment_type", "Employment Type"],
  ["description", "Job Description", true],
  ["key_responsibilities", "Key Responsibilities", true],
  ["required_skills", "Required Skills", true],
  ["preferred_skills", "Preferred Skills", true],
  ["recruiter_name", "Recruiter Name"],
  ["recruiter_email", "Recruiter Email"],
  ["application_link", "Application Link"],
  ["source_link", "Source Link"],
  ["admin_notes", "Internal Admin Notes (never shown to candidates)", true],
];

export default function JobEdit() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [form, setForm] = useState<any>(EMPTY);
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (id) {
      api(`/admin/jobs/${id}`).then((res) => setForm({ ...EMPTY, ...res.job })).catch(() => {});
    }
  }, [id]);

  const save = async () => {
    if (!form.title || !form.company) return toast.show("Title and company are required", "error");
    setLoading(true);
    try {
      if (id) await api(`/admin/jobs/${id}`, { method: "PUT", body: form });
      else await api("/admin/jobs", { method: "POST", body: form });
      toast.show(id ? "Job updated" : "Job created", "success");
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job"] });
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      router.back();
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={id ? "Edit Job" : "Add Job"} />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }} bottomOffset={24} showsVerticalScrollIndicator={false}>
        <Input label="Job Title *" value={form.title} onChangeText={(v) => set("title", v)} testID="jobedit-title" />
        <Input label="Company Name *" value={form.company} onChangeText={(v) => set("company", v)} testID="jobedit-company" />

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Function</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c.split(" & ")[0]} selected={form.function === c} onPress={() => set("function", c)} />
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Industry</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {INDUSTRIES_WITH_OTHER.map((c) => (
              <Chip key={c} label={INDUSTRY_SHORT[c] || c} selected={form.industry_category === c} onPress={() => set("industry_category", c)} testID={`jobedit-ind-${c}`} />
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Region</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {REGIONS.map((r) => (
              <Chip key={r} label={r} selected={form.region === r} onPress={() => set("region", r)} testID={`jobedit-region-${r}`} />
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Currency</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CURRENCIES.map((c) => (
              <Chip key={c} label={c} selected={form.currency === c} onPress={() => set("currency", c)} testID={`jobedit-cur-${c}`} />
            ))}
          </ScrollView>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Work Mode</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {WORK_MODES.map((m) => (
              <Chip key={m} label={m} selected={form.work_mode === m} onPress={() => set("work_mode", m)} />
            ))}
          </ScrollView>
        </View>

        {TEXT_FIELDS.filter(([k]) => !["title", "company"].includes(k)).map(([k, label, multi]) => (
          <Input
            key={k}
            label={label}
            value={String(form[k] ?? "")}
            onChangeText={(v) => set(k, v)}
            multiline={!!multi}
            numberOfLines={multi ? 4 : 1}
            style={multi ? { minHeight: 90, textAlignVertical: "top" } : undefined}
            testID={`jobedit-${k}`}
          />
        ))}

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {JOB_STATUSES.map((s) => (
              <Chip key={s} label={s} selected={form.status === s} onPress={() => set("status", s)} />
            ))}
          </ScrollView>
        </View>

        <Pressable style={styles.toggle} onPress={() => set("featured", !form.featured)} testID="jobedit-featured">
          <Text style={styles.label}>Featured Job</Text>
          <View style={[styles.switch, form.featured && { backgroundColor: colors.brandPrimary }]}>
            <View style={[styles.knob, form.featured && { alignSelf: "flex-end" }]} />
          </View>
        </Pressable>

        <Button title={id ? "Save Changes" : "Create Job"} onPress={save} loading={loading} testID="jobedit-save" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  label: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  switch: { width: 48, height: 28, borderRadius: 999, backgroundColor: colors.border, padding: 3, justifyContent: "center" },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
}));
