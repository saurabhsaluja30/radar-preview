import React from "react";
import { Pressable, ScrollView, Text, View, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as Linking from "expo-linking";
import {
  BookmarkSimple,
  Buildings,
  MapPin,
  Briefcase,
  LockSimple,
  PaperPlaneTilt,
  User,
  EnvelopeSimple,
  LinkSimple,
  Star,
} from "phosphor-react-native";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button } from "@/src/components/ui";
import { ScreenHeader } from "@/src/components/Brand";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

export default function JobDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isMember } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["job", id, user?.user_id],
    queryFn: () => api(`/jobs/${id}`, { auth: !!user }),
  });

  const job = data?.job;
  const locked = job?.locked;

  const toggleSave = async () => {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    try {
      if (job.is_saved) {
        await api(`/jobs/${id}/save`, { method: "DELETE" });
        toast.show("Removed from saved", "info");
      } else {
        await api(`/jobs/${id}/save`, { method: "POST" });
        toast.show("Saved!", "success");
      }
      qc.invalidateQueries({ queryKey: ["job", id] });
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      toast.show("Something went wrong", "error");
    }
  };

  const apply = async () => {
    try {
      const res = await api(`/jobs/${id}/apply-click`, { method: "POST" });
      const link = res.application_link || job.application_link;
      if (link) Linking.openURL(link);
      else toast.show("No application link available", "info");
    } catch {
      toast.show("Active membership required", "error");
    }
  };

  if (isLoading || !job) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Job Details" />
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Job Details"
        right={
          <Pressable onPress={toggleSave} hitSlop={8} testID="job-save-btn">
            <BookmarkSimple
              size={24}
              color={colors.brandPrimary}
              weight={job.is_saved ? "fill" : "regular"}
            />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 170 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logo}>
            <Briefcase size={30} color={colors.brandPrimary} weight="duotone" />
          </View>
          <Text style={styles.title}>{job.title}</Text>
          <View style={styles.metaRow}>
            <Buildings size={16} color={colors.muted} />
            <Text style={styles.company}>{job.company}</Text>
            {job.featured ? <Star size={15} color={colors.warning} weight="fill" /> : null}
          </View>
          <View style={styles.chips}>
            {[job.location, job.work_mode, job.experience_required, job.employment_type]
              .filter(Boolean)
              .map((c: string, i: number) => (
                <View key={i} style={styles.chip}>
                  {i === 0 ? <MapPin size={13} color={colors.onSurfaceTertiary} /> : null}
                  <Text style={styles.chipTxt}>{c}</Text>
                </View>
              ))}
          </View>
        </View>

        {/* Public overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.kvGrid}>
            <KV label="Function" value={job.function} />
            <KV label="Industry" value={job.industry_category || job.function} />
            <KV label="Region" value={job.region} />
            <KV label="City" value={job.city || job.location} />
            <KV label="Country" value={job.country} />
            <KV label="Posted" value={formatDate(job.date_added)} />
            <KV label="Deadline" value={formatDate(job.application_deadline)} />
          </View>
          {job.visa_info ? (
            <View style={styles.visaBox}>
              <Text style={styles.visaLabel}>Work Authorization / Visa</Text>
              <Text style={styles.visaTxt}>{job.visa_info}</Text>
            </View>
          ) : null}
        </View>

        {/* Premium content */}
        {isMember && !locked ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Description</Text>
            <Text style={styles.body}>{job.description}</Text>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Key Responsibilities</Text>
            <Text style={styles.body}>{job.key_responsibilities}</Text>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Required Skills</Text>
            <Text style={styles.body}>{job.required_skills}</Text>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Preferred Skills</Text>
            <Text style={styles.body}>{job.preferred_skills}</Text>

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Salary Range</Text>
            <Text style={styles.body}>{job.salary_range || "Not disclosed"}</Text>

            {(job.recruiter_name || job.recruiter_email) ? (
              <View style={styles.recruiter}>
                <Text style={styles.recruiterTitle}>Recruiter Information</Text>
                {job.recruiter_name ? (
                  <View style={styles.recRow}>
                    <User size={16} color={colors.brandPrimary} />
                    <Text style={styles.recTxt}>{job.recruiter_name}</Text>
                  </View>
                ) : null}
                {job.recruiter_email ? (
                  <View style={styles.recRow}>
                    <EnvelopeSimple size={16} color={colors.brandPrimary} />
                    <Text style={styles.recTxt}>{job.recruiter_email}</Text>
                  </View>
                ) : null}
                {job.source_link ? (
                  <Pressable style={styles.recRow} onPress={() => Linking.openURL(job.source_link)}>
                    <LinkSimple size={16} color={colors.brandPrimary} />
                    <Text style={[styles.recTxt, { textDecorationLine: "underline" }]}>View source</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerTxt}>{job.disclaimer}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Full Details</Text>
            <Text style={styles.body} numberOfLines={2}>
              {job.preview}
            </Text>
            <View style={styles.lockedWrap}>
              <View style={styles.fakeContent} pointerEvents="none">
                {[...Array(6)].map((_, i) => (
                  <View key={i} style={[styles.fakeLine, { width: `${90 - i * 8}%` }]} />
                ))}
              </View>
              <BlurView intensity={Platform.OS === "android" ? 22 : 30} tint="light" style={styles.blur}>
                <View style={styles.glassCard}>
                  <View style={styles.lockCircle}>
                    <LockSimple size={26} color={colors.brandPrimary} weight="fill" />
                  </View>
                  <Text style={styles.lockedTitle}>Premium Details Locked</Text>
                  <Text style={styles.lockedSub}>
                    Full description, recruiter contact and direct application link are available to active
                    members.
                  </Text>
                  <Button
                    title="Become a Member to View Full Details"
                    onPress={() => router.push("/plans")}
                    testID="job-unlock-btn"
                  />
                </View>
              </BlurView>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {isMember && !locked ? (
          <Button
            title="Apply Now"
            onPress={apply}
            testID="job-apply-btn"
            icon={<PaperPlaneTilt size={18} color={colors.onBrandPrimary} weight="fill" />}
          />
        ) : (
          <Button title="View Membership Plans" onPress={() => router.push("/plans")} testID="job-plans-btn" />
        )}
        {job ? (
          <Button
            title="Prepare for Interview"
            variant="ghost"
            size="sm"
            onPress={() => router.push(user ? (`/career/interview?jobId=${id}` as any) : "/auth/login")}
            testID="job-prepare-interview-btn"
          />
        ) : null}
      </View>
    </View>
  );
}

function KV({ label, value }: { label: string; value?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value || "—"}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  hero: { padding: 20, gap: 10 },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "900", lineHeight: 30, letterSpacing: -0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  company: { color: colors.muted, fontSize: 15, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipTxt: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
  section: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginBottom: 10 },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 22 },
  kvGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kv: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
  },
  kvLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  kvValue: { color: colors.onSurface, fontSize: 14, fontWeight: "700", marginTop: 3 },
  recruiter: {
    marginTop: 20,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  recruiterTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  recRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  recTxt: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  disclaimerBox: { marginTop: 20, backgroundColor: colors.surfaceSecondary, padding: 14, borderRadius: 12 },
  disclaimerTxt: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  visaBox: { marginTop: 14, backgroundColor: colors.brandTertiary, padding: 14, borderRadius: 12 },
  visaLabel: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "800" },
  visaTxt: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  lockedWrap: { marginTop: 14, borderRadius: 18, overflow: "hidden", minHeight: 280 },
  fakeContent: { padding: 20, gap: 14, backgroundColor: colors.surfaceSecondary, minHeight: 280 },
  fakeLine: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceTertiary },
  blur: { ...StyleSheetAbs(), alignItems: "center", justifyContent: "center", padding: 16 },
  glassCard: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.25)",
    width: "100%",
    maxWidth: 360,
  },
  lockCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  lockedSub: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19, marginBottom: 6 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
}));

function StyleSheetAbs() {
  return { position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0 };
}
