import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Card, Badge, Button, Chip } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

const FILTERS = ["All", "active", "expiring_soon", "expired", "cancelled", "payment_failed"];

export default function AdminSubscriptions() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("All");

  const { data } = useQuery({ queryKey: ["admin-subs", filter], queryFn: () => api("/admin/subscriptions", { query: { status: filter } }) });
  const subs: any[] = data?.subscriptions || [];

  const cancel = async (id: string) => {
    try {
      await api(`/admin/subscriptions/${id}/cancel`, { method: "POST" });
      toast.show("Subscription cancelled", "success");
      qc.invalidateQueries({ queryKey: ["admin-subs"] });
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    }
  };

  const color = (s: string): any => (s === "active" || s === "expiring_soon" ? "success" : s === "cancelled" || s === "expired" || s === "payment_failed" ? "error" : "info");

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Subscriptions" />
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map((f) => (
            <Chip key={f} label={f.replace("_", " ")} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        {subs.map((s) => (
          <Card key={s.subscription_id} testID={`admin-sub-${s.subscription_id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.candidate_name || s.candidate_email}</Text>
                <Text style={styles.meta}>{s.plan_name} {s.is_demo ? "· DEMO" : ""}</Text>
              </View>
              <Badge label={(s.effective_status || "").replace("_", " ")} color={color(s.effective_status)} />
            </View>
            <Text style={styles.meta}>Start: {formatDate(s.start_date)} · Expiry: {formatDate(s.expiry_date)}</Text>
            {s.effective_status !== "cancelled" ? (
              <View style={{ marginTop: 10 }}>
                <Button title="Cancel Subscription" size="sm" variant="danger" fullWidth={false} onPress={() => cancel(s.subscription_id)} testID={`sub-cancel-${s.subscription_id}`} />
              </View>
            ) : null}
          </Card>
        ))}
        {subs.length === 0 ? <Text style={styles.empty}>No subscriptions.</Text> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  filterWrap: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 4 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 30 },
}));
