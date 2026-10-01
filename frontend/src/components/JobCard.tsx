import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Buildings, MapPin, LockSimple, Star, BriefcaseMetal } from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { timeAgo } from "@/src/utils/format";

export type Job = {
  job_id: string;
  title: string;
  company: string;
  location?: string;
  function?: string;
  experience_required?: string;
  work_mode?: string;
  date_added?: string;
  featured?: boolean;
  locked?: boolean;
  is_saved?: boolean;
  preview?: string;
  region?: string;
  country?: string;
};

export function JobCard({ job, testID }: { job: Job; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Pressable
      testID={testID || `job-card-${job.job_id}`}
      onPress={() => router.push(`/job/${job.job_id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.top}>
        <View style={styles.logo}>
          <BriefcaseMetal size={22} color={colors.brandPrimary} weight="duotone" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>
              {job.title}
            </Text>
            {job.featured ? (
              <Star size={16} color={colors.warning} weight="fill" />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <Buildings size={14} color={colors.muted} weight="regular" />
            <Text style={styles.company} numberOfLines={1}>
              {job.company}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.tags}>
        {job.region === "International" && job.country ? (
          <View style={[styles.tag, { backgroundColor: colors.surfaceInverse }]}>
            <Text style={[styles.tagTxt, { color: colors.onSurfaceInverse }]}>Intl · {job.country}</Text>
          </View>
        ) : null}
        {job.location ? (
          <View style={styles.tag}>
            <MapPin size={13} color={colors.onSurfaceTertiary} weight="regular" />
            <Text style={styles.tagTxt}>{job.location}</Text>
          </View>
        ) : null}
        {job.work_mode ? (
          <View style={styles.tag}>
            <Text style={styles.tagTxt}>{job.work_mode}</Text>
          </View>
        ) : null}
        {job.experience_required ? (
          <View style={styles.tag}>
            <Text style={styles.tagTxt}>{job.experience_required}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text style={styles.date}>{timeAgo(job.date_added)}</Text>
        {job.locked ? (
          <View style={styles.locked}>
            <LockSimple size={13} color={colors.brandPrimary} weight="fill" />
            <Text style={styles.lockedTxt}>Members only</Text>
          </View>
        ) : (
          <View style={styles.unlocked}>
            <Text style={styles.unlockedTxt}>Full access</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  top: { flexDirection: "row", gap: 12 },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  title: { flex: 1, color: colors.onSurface, fontSize: 16, fontWeight: "800", lineHeight: 21 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  company: { color: colors.muted, fontSize: 13, fontWeight: "600", flex: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagTxt: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 10,
  },
  date: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  locked: { flexDirection: "row", alignItems: "center", gap: 5 },
  lockedTxt: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  unlocked: {},
  unlockedTxt: { color: colors.success, fontSize: 12, fontWeight: "700" },
}));
