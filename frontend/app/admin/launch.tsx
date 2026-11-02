import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Card, EmptyState } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme } from "@/src/theme";
import { formatDate } from "@/src/utils/format";

export default function AdminLaunch() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-launch"], queryFn: () => api("/admin/launch-offer") });
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (q.data?.settings) setS({ ...q.data.settings });
  }, [q.data]);

  const save = async () => {
    setBusy("save");
    try {
      await api("/admin/launch-offer", {
        method: "PUT",
        body: {
          enabled: !!s.enabled,
          plans_hidden: !!s.plans_hidden,
          free_spots: Number(s.free_spots) || 0,
          free_days: Number(s.free_days) || 90,
        },
      });
      await q.refetch();
      toast.show("Launch offer saved", "success");
    } catch (e: any) {
      toast.show(e.message || "Save failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const approve = async (id: string) => {
    setBusy(id);
    try {
      await api(`/admin/launch-offer/approve/${id}`, { method: "POST" });
      await q.refetch();
      toast.show("Access approved and email logged", "success");
    } catch (e: any) {
      toast.show(e.message || "Approve failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const wait: any[] = q.data?.waitlist || [];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Launch Offer & Waitlist" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 40 }}>
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} /> : null}
        {q.isError ? <EmptyState title="Could not load launch settings. Pull back and try again." testID="admin-launch-error" /> : null}
        {s ? (
          <Card style={{ gap: 12 }} testID="admin-launch-settings">
            <Text style={styles.h}>Free launch offer</Text>
            <Text style={styles.p}>
              {s.granted || 0} of {s.free_spots} free spots used · new sign-ups only
            </Text>
            <View style={styles.row}>
              <Text style={styles.p}>Offer active (free access for new sign-ups)</Text>
              <Switch value={!!s.enabled} onValueChange={(v) => setS({ ...s, enabled: v })} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.surface} style={{ minWidth: 52, minHeight: 44 }} testID="admin-launch-enabled" />
            </View>
            <View style={styles.row}>
              <Text style={styles.p}>Hide membership plans & payments</Text>
              <Switch value={!!s.plans_hidden} onValueChange={(v) => setS({ ...s, plans_hidden: v })} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} thumbColor={colors.surface} style={{ minWidth: 52, minHeight: 44 }} testID="admin-launch-hidden" />
            </View>
            <View style={styles.row}>
              <Text style={styles.p}>Free spots</Text>
              <TextInput value={String(s.free_spots)} onChangeText={(v) => setS({ ...s, free_spots: v.replace(/\D/g, "") })} keyboardType="number-pad" style={styles.num} testID="admin-launch-spots" />
            </View>
            <View style={styles.row}>
              <Text style={styles.p}>Free access days</Text>
              <TextInput value={String(s.free_days)} onChangeText={(v) => setS({ ...s, free_days: v.replace(/\D/g, "") })} keyboardType="number-pad" style={styles.num} testID="admin-launch-days" />
            </View>
            <Button title="Save" loading={busy === "save"} onPress={save} testID="admin-launch-save" />
          </Card>
        ) : null}

        <Text style={styles.h}>Waitlist ({wait.length})</Text>
        {wait.length === 0 ? <EmptyState title="No one on the waitlist" testID="admin-waitlist-empty" /> : null}
        {wait.map((w) => (
          <Card key={w.user_id} style={{ gap: 6 }} testID={`waitlist-${w.user_id}`}>
            <Text style={styles.h2}>{w.full_name || "Candidate"}</Text>
            <Text style={styles.muted}>
              {w.email}
              {w.mobile ? ` · ${w.mobile}` : ""} · joined {formatDate(w.waitlisted_at)}
            </Text>
            <Button title="Approve Free Access" size="sm" loading={busy === w.user_id} onPress={() => approve(w.user_id)} testID={`waitlist-approve-${w.user_id}`} />
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  h2: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  p: { color: colors.onSurfaceSecondary, fontSize: 14, flexShrink: 1 },
  muted: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  num: {
    width: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: "center",
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
  },
}));
