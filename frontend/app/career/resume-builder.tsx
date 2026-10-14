import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Card, Chip, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useTheme } from "@/src/theme";
import {
  ConsentGate,
  UsagePill,
  formatErr,
  useCareerStyles,
  useCareerUsage,
  useInvalidateUsage,
} from "@/src/components/career";

type Field = { key: string; label: string; hint: string };

const FRESHER: Field[] = [
  { key: "career_objective", label: "Career objective / summary", hint: "What role you want and what you bring" },
  { key: "education", label: "Education & academic achievements", hint: "Degree, college, year, marks/CGPA, awards" },
  { key: "internships_projects", label: "Internships & projects", hint: "Name, organisation, dates, what you did and results" },
  { key: "skills_certifications", label: "Skills & certifications", hint: "Tools, languages, certificates you genuinely hold" },
  { key: "coursework", label: "Relevant coursework", hint: "Subjects related to the job" },
  { key: "activities", label: "Extracurricular activities & achievements", hint: "Clubs, events, volunteering, awards" },
];

const EXPERIENCED: Field[] = [
  { key: "professional_summary", label: "Professional summary", hint: "Years of experience, domain, key strengths" },
  { key: "employment", label: "Current & previous employment", hint: "Job title | Company | Start–End dates (one per line)" },
  { key: "responsibilities_achievements", label: "Responsibilities & measurable achievements", hint: "Per role: what you owned and real results (numbers if you have them)" },
  { key: "skills_tools", label: "Skills & tools", hint: "Software, methods, domain skills" },
  { key: "education_certifications", label: "Education & certifications", hint: "Degree, institution, year; certifications" },
];

export default function ResumeBuilder() {
  const styles = useCareerStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { data: usage } = useCareerUsage();
  const invalidate = useInvalidateUsage();

  const [type, setType] = useState<"fresher" | "experienced" | null>(null);
  const [title, setTitle] = useState("");
  const [personal, setPersonal] = useState({
    full_name: user?.full_name || "",
    email: user?.email || "",
    phone: (user as any)?.mobile || "",
    location: (user as any)?.preferred_location || "",
    linkedin: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const fields = type === "fresher" ? FRESHER : EXPERIENCED;
  const setP = (k: string, v: string) => setPersonal((p) => ({ ...p, [k]: v }));

  const generate = async () => {
    if (loading) return;
    if (!personal.full_name.trim()) return toast.show("Please enter your full name", "error");
    setLoading(true);
    try {
      const res = await api<{ resume: any }>("/career/resumes/generate", {
        method: "POST",
        body: { resume_type: type, title: title || undefined, personal, answers },
      });
      await invalidate();
      toast.show("Resume generated — review and edit it", "success");
      router.replace(`/career/resume/${res.resume.resume_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const createBlank = async () => {
    setLoading(true);
    try {
      const sections = fields.map((f) => ({ title: f.label.toUpperCase(), content: answers[f.key] || "" }));
      const res = await api<{ resume: any }>("/career/resumes", {
        method: "POST",
        body: { title: title || "My Resume", resume_type: type, personal, sections },
      });
      router.replace(`/career/resume/${res.resume.resume_id}` as any);
    } catch (e) {
      toast.show(formatErr(e), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="ATS Resume Builder" />
      <ConsentGate>
        <KeyboardAwareScrollView
          bottomOffset={24}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}
        >
          <Card style={{ gap: 10 }}>
            <Text style={styles.h}>1. Choose your resume type</Text>
            <View style={styles.chipWrap}>
              <Chip label="Fresher" selected={type === "fresher"} onPress={() => setType("fresher")} testID="rb-type-fresher" />
              <Chip label="Experienced" selected={type === "experienced"} onPress={() => setType("experienced")} testID="rb-type-experienced" />
            </View>
            <Text style={styles.muted}>
              Fresher: students, recent graduates or no full-time experience. Experienced: previous or current work
              experience.
            </Text>
          </Card>

          {type ? (
            <>
              <Card style={{ gap: 12 }}>
                <Text style={styles.h}>2. Contact information</Text>
                <Input label="Resume name (for your reference)" value={title} onChangeText={setTitle} placeholder="e.g. Resume for HR roles" testID="rb-title" />
                <Input label="Full name *" value={personal.full_name} onChangeText={(v) => setP("full_name", v)} testID="rb-name" />
                <Input label="Email" value={personal.email} onChangeText={(v) => setP("email", v)} keyboardType="email-address" autoCapitalize="none" testID="rb-email" />
                <Input label="Phone" value={personal.phone} onChangeText={(v) => setP("phone", v)} keyboardType="phone-pad" testID="rb-phone" />
                <Input label="Location" value={personal.location} onChangeText={(v) => setP("location", v)} testID="rb-location" />
                <Input label="LinkedIn (optional)" value={personal.linkedin} onChangeText={(v) => setP("linkedin", v)} autoCapitalize="none" testID="rb-linkedin" />
              </Card>

              <Card style={{ gap: 14 }}>
                <Text style={styles.h}>3. Your details</Text>
                <Text style={styles.muted}>
                  Write only true information. Our AI rewrites it professionally but never adds experience, skills or
                  achievements you did not provide.
                </Text>
                {fields.map((f) => (
                  <View key={f.key}>
                    <Text style={styles.label}>{f.label}</Text>
                    <TextInput
                      testID={`rb-field-${f.key}`}
                      multiline
                      value={answers[f.key] || ""}
                      onChangeText={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))}
                      placeholder={f.hint}
                      placeholderTextColor={colors.muted}
                      style={[styles.area, { minHeight: 90 }]}
                      maxLength={4000}
                    />
                  </View>
                ))}
              </Card>

              <UsagePill tool="resume_builder" usage={usage} />
              <Button title="Generate ATS Resume with AI" loading={loading} onPress={generate} testID="rb-generate" />
              <Button title="Skip AI — create editable resume from my answers" variant="outline" disabled={loading} onPress={createBlank} testID="rb-manual" />
            </>
          ) : null}
        </KeyboardAwareScrollView>
      </ConsentGate>
    </View>
  );
}
