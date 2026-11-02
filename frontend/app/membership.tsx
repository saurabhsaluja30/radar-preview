import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Card, Badge } from "@/src/components/ui";
import { ScreenHeader } from "@/src/components/Brand";
import { MembershipCard } from "@/src/components/MembershipCard";
import { OpportunityNotice } from "@/src/components/OpportunityNotice";
import { money, formatDate } from "@/src/utils/format";
import { LaunchOfferCard, useLaunchOffer } from "@/src/components/LaunchOffer";

export default function Membership() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { data: launch } = useLaunchOffer();

  const { data } = useQuery({
    queryKey: ["membership", user?.user_id],
    queryFn: () => api("/membership"),
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={launch?.plans_hidden ? "My Access" : "Membership"} />
        <View style={{ padding: 24, gap: 16 }}>
          <Text style={styles.info}>Login to view your {launch?.plans_hidden ? "access" : "membership"}.</Text>
          <Button title="Login" onPress={() => router.push("/auth/login")} />
        </View>
      </View>
    );
  }

  const membership = data?.membership;
  const payments: any[] = data?.payments || [];
  const plans: any[] = data?.plans || [];
  const hidden = !!launch?.plans_hidden;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={hidden ? "My Access" : "Membership"} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <MembershipCard membership={membership} hidePlanName={hidden} onRenew={hidden ? undefined : () => router.push("/plans")} />

        <View style={{ marginTop: 16 }}>
          {hidden ? <LaunchOfferCard /> : <OpportunityNotice />}
        </View>

        {!hidden ? (
          <>
            <Text style={styles.section}>Available Plans</Text>
            <View style={{ gap: 10 }}>
              {plans.map((p) => (
                <Card key={p.plan_id} style={styles.planRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{p.name}</Text>
                    <Text style={styles.planDur}>{p.duration_days} days · {money(p.price, p.currency)}</Text>
                  </View>
                  {p.featured ? <Badge label="Recommended" color="brand" /> : null}
                </Card>
              ))}
              <Button title="Renew / Upgrade" onPress={() => router.push("/plans")} testID="membership-plans-btn" />
            </View>
          </>
        ) : null}

        {hidden ? null : <Text style={styles.section}>Payment History</Text>}
        {hidden ? null : payments.length === 0 ? (
          <Card><Text style={styles.info}>No payments yet.</Text></Card>
        ) : (
          <View style={{ gap: 10 }}>
            {payments.map((p) => (
              <Card key={p.payment_id} style={styles.payRow} testID={`payment-${p.payment_id}`}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.payPlan}>{p.plan_name}</Text>
                    {p.is_demo ? <Badge label="DEMO" color="warning" /> : null}
                  </View>
                  <Text style={styles.payDate}>{formatDate(p.payment_date)} · {p.gateway}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.payAmt}>{money(p.amount, p.currency)}</Text>
                  <Badge
                    label={p.status}
                    color={p.status === "successful" ? "success" : p.status === "failed" ? "error" : "info"}
                  />
                </View>
              </Card>
            ))}
          </View>
        )}

        {hidden ? null : (
        <>
        <Text style={styles.section}>Policies</Text>
        <Card>
          <Text style={styles.policyTitle}>Refund Policy</Text>
          <Text style={styles.policyTxt}>Membership fees are generally non-refundable once premium access is activated. See the full Refund Policy for exceptions.</Text>
          <Text style={[styles.policyTitle, { marginTop: 12 }]}>Cancellation Policy</Text>
          <Text style={styles.policyTxt}>You may cancel anytime; access continues until your current expiry date. Membership does not auto-renew in demo mode.</Text>
        </Card>
        </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 24, marginBottom: 12 },
  info: { color: colors.muted, fontSize: 14 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  planName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  planDur: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payPlan: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  payDate: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  payAmt: { color: colors.onSurface, fontSize: 15, fontWeight: "900", marginBottom: 4 },
  policyTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  policyTxt: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
}));
