import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MagnifyingGlass } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Card, Badge, Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

const statusColor = (s: string): any =>
  s === "active" || s === "expiring_soon" ? "success" : s === "no_membership" ? "info" : s === "expiring_soon" ? "warning" : "error";

export default function AdminCandidates() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ["admin-candidates", q], queryFn: () => api("/admin/candidates", { query: { q } }) });
  const candidates: any[] = data?.candidates || [];

  const act = async (fn: () => Promise<any>, msg: string) => {
    try {
      await fn();
      toast.show(msg, "success");
      qc.invalidateQueries({ queryKey: ["admin-candidates"] });
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Candidates" />
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <MagnifyingGlass size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search name, email, mobile..." placeholderTextColor={colors.muted} style={styles.searchInput} testID="admin-cand-search" />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.count}>{candidates.length} candidates</Text>
        {candidates.map((c) => (
          <Card key={c.user_id} testID={`admin-cand-${c.email}`}>
            <Pressable onPress={() => setOpen(open === c.user_id ? null : c.user_id)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.full_name || "—"}</Text>
                  <Text style={styles.email}>{c.email}</Text>
                </View>
                <Badge label={(c.membership_status || "").replace("_", " ")} color={statusColor(c.membership_status)} />
              </View>
            </Pressable>
            {open === c.user_id ? (
              <View style={styles.detail}>
                <Text style={styles.meta}>Mobile: {c.mobile || "—"}</Text>
                <Text style={styles.meta}>Plan: {c.plan_name || "—"} · Expiry: {formatDate(c.expiry_date)}</Text>
                <Text style={styles.meta}>Joined: {formatDate(c.created_at)} · {c.suspended ? "Suspended" : "Active"}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <Button title="Extend 30 days" size="sm" variant="outline" fullWidth={false} onPress={() => act(() => api(`/admin/candidates/${c.user_id}/extend`, { method: "POST", body: { days: 30 } }), "Extended 30 days")} testID={`cand-extend-${c.email}`} />
                  <Button title={c.suspended ? "Reactivate" : "Suspend"} size="sm" variant={c.suspended ? "secondary" : "danger"} fullWidth={false} onPress={() => act(() => api(`/admin/candidates/${c.user_id}/suspend`, { method: "POST", body: { suspended: !c.suspended } }), c.suspended ? "Reactivated" : "Suspended")} testID={`cand-suspend-${c.email}`} />
                </View>
              </View>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.onSurface },
  count: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  email: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  detail: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10, gap: 4 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
}));
