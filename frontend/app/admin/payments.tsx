import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Card, Badge, Chip } from "@/src/components/ui";
import { money, formatDate } from "@/src/utils/format";

const FILTERS: [string, string][] = [["all", "All"], ["real", "Real"], ["demo", "Demo"]];

export default function AdminPayments() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [demo, setDemo] = useState("all");

  const { data } = useQuery({ queryKey: ["admin-payments", demo], queryFn: () => api("/admin/payments", { query: { demo } }) });
  const payments: any[] = data?.payments || [];

  const realRevenue = payments.filter((p) => !p.is_demo && p.status === "successful").reduce((s, p) => s + p.amount, 0);
  const demoRevenue = payments.filter((p) => p.is_demo && p.status === "successful").reduce((s, p) => s + p.amount, 0);

  const color = (s: string): any => (s === "successful" ? "success" : s === "failed" ? "error" : "info");

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Payments" />
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.sumLabel}>Real Revenue</Text>
          <Text style={styles.sumVal}>{money(realRevenue)}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.sumLabel}>Demo Revenue</Text>
          <Text style={[styles.sumVal, { color: "#D97706" }]}>{money(demoRevenue)}</Text>
        </View>
      </View>
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map(([v, l]) => (
            <Chip key={v} label={l} selected={demo === v} onPress={() => setDemo(v)} testID={`pay-filter-${v}`} />
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }} showsVerticalScrollIndicator={false}>
        {payments.map((p) => (
          <Card key={p.payment_id} testID={`admin-pay-${p.payment_id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.name}>{p.plan_name}</Text>
                  {p.is_demo ? <Badge label="DEMO" color="warning" /> : null}
                </View>
                <Text style={styles.meta}>{p.candidate_email}</Text>
                <Text style={styles.meta}>{formatDate(p.payment_date)} · {p.transaction_id}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={styles.amt}>{money(p.amount, p.currency)}</Text>
                <Badge label={p.status} color={color(p.status)} />
              </View>
            </View>
          </Card>
        ))}
        {payments.length === 0 ? <Text style={styles.empty}>No payments.</Text> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  summaryRow: { flexDirection: "row", gap: 10, padding: 16 },
  summaryBox: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  sumLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  sumVal: { color: colors.brandPrimary, fontSize: 22, fontWeight: "900", marginTop: 4 },
  filterWrap: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 3 },
  amt: { color: colors.onSurface, fontSize: 16, fontWeight: "900" },
  empty: { color: colors.muted, textAlign: "center", marginTop: 30 },
}));
