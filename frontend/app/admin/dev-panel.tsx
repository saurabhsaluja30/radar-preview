import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Card, Badge } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

const ACTIONS: { action: string; label: string; group: string }[] = [
  { action: "activate_90", label: "Activate 90-Day Plan", group: "Activate" },
  { action: "activate_180", label: "Activate 180-Day Plan", group: "Activate" },
  { action: "activate_365", label: "Activate 365-Day Plan", group: "Activate" },
  { action: "expire_now", label: "Expire Membership Now", group: "Expiry" },
  { action: "expiry_7", label: "Set Expiry in 7 Days", group: "Expiry" },
  { action: "expiry_3", label: "Set Expiry in 3 Days", group: "Expiry" },
  { action: "expiry_1", label: "Set Expiry Tomorrow", group: "Expiry" },
  { action: "reminder_7", label: "Trigger 7-Day Reminder", group: "Reminders" },
  { action: "reminder_3", label: "Trigger 3-Day Reminder", group: "Reminders" },
  { action: "reminder_1", label: "Trigger 1-Day Reminder", group: "Reminders" },
  { action: "simulate_failed_payment", label: "Simulate Failed Payment", group: "Payments" },
  { action: "simulate_renewal", label: "Simulate Successful Renewal", group: "Payments" },
  { action: "reset_account", label: "Reset Test Account", group: "Danger" },
  { action: "delete_subscription", label: "Delete Demo Subscription", group: "Danger" },
];

const GROUPS = ["Activate", "Expiry", "Reminders", "Payments", "Danger"];

export default function DevPanel() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, refetch } = useQuery({ queryKey: ["dev-candidates"], queryFn: () => api("/admin/dev/candidates") });
  const candidates: any[] = data?.candidates || [];
  const current = candidates.find((c) => c.user_id === selected);

  const run = async (action: string) => {
    if (!selected) return toast.show("Select a candidate first", "error");
    setBusy(action);
    try {
      const res = await api("/admin/dev/action", { method: "POST", body: { candidate_id: selected, action } });
      toast.show(res.message || "Done", "success");
      await refetch();
      qc.invalidateQueries();
    } catch (e: any) {
      toast.show(e.message || "Action failed", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Developer Test Panel" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Text style={styles.bannerTxt}>Demo mode — all transactions are marked DEMO and excluded from real revenue.</Text>
        </View>

        <Text style={styles.section}>1. Select a test candidate</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
          {candidates.map((c) => (
            <Pressable
              key={c.user_id}
              onPress={() => setSelected(c.user_id)}
              style={[styles.candChip, selected === c.user_id && styles.candChipSel]}
              testID={`dev-candidate-${c.email}`}
            >
              <Text style={[styles.candName, selected === c.user_id && { color: "#FFFFFF" }]} numberOfLines={1}>
                {c.full_name || c.email}
              </Text>
              <Text style={[styles.candEmail, selected === c.user_id && { color: "rgba(255,255,255,0.8)" }]} numberOfLines={1}>
                {c.email}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {current ? (
          <Card style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.curName}>{current.full_name}</Text>
              <Badge label={(current.status || "").replace("_", " ")} color={current.status === "active" ? "success" : current.status === "expiring_soon" ? "warning" : current.status === "no_membership" ? "info" : "error"} />
            </View>
            <Text style={styles.curMeta}>
              Expiry: {formatDate(current.expiry_date)} · {current.days_remaining} days left
            </Text>
          </Card>
        ) : null}

        <Text style={styles.section}>2. Run test actions</Text>
        {GROUPS.map((g) => (
          <View key={g} style={{ marginBottom: 14 }}>
            <Text style={styles.groupLabel}>{g}</Text>
            <View style={styles.actionGrid}>
              {ACTIONS.filter((a) => a.group === g).map((a) => (
                <Pressable
                  key={a.action}
                  onPress={() => run(a.action)}
                  disabled={busy === a.action}
                  style={[styles.actionBtn, g === "Danger" && styles.actionDanger, busy === a.action && { opacity: 0.5 }]}
                  testID={`dev-action-${a.action}`}
                >
                  <Text style={[styles.actionTxt, g === "Danger" && { color: colors.error }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  banner: { backgroundColor: "#FEF3C7", padding: 12, borderRadius: 12 },
  bannerTxt: { color: colors.warning, fontSize: 12, fontWeight: "700", lineHeight: 17 },
  section: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: 20, marginBottom: 12 },
  candChip: { width: 170, backgroundColor: colors.surfaceSecondary, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: colors.border },
  candChipSel: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  candName: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  candEmail: { color: colors.muted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  curName: { color: colors.onSurface, fontSize: 16, fontWeight: "900" },
  curMeta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 6 },
  groupLabel: { color: colors.muted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, flexGrow: 1, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  actionDanger: { backgroundColor: "#FEE2E2", borderColor: "#FECACA" },
  actionTxt: { color: colors.brandPrimary, fontSize: 13, fontWeight: "800", textAlign: "center" },
}));
