import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { JobCard } from "@/src/components/JobCard";
import { Button, Card, Badge, SectionTitle } from "@/src/components/ui";
import { ScreenHeader } from "@/src/components/Brand";
import { MembershipCard } from "@/src/components/MembershipCard";
import { money, formatDate } from "@/src/utils/format";
import { CareerToolsCards } from "@/src/components/career";
import { useLaunchOffer } from "@/src/components/LaunchOffer";

export default function Dashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { data: launch } = useLaunchOffer();

  const { data } = useQuery({
    queryKey: ["dashboard", user?.user_id],
    queryFn: () => api("/dashboard"),
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Dashboard" />
        <View style={{ padding: 24, gap: 16 }}>
          <Text style={styles.info}>Login to view your dashboard.</Text>
          <Button title="Login" onPress={() => router.push("/auth/login")} />
        </View>
      </View>
    );
  }

  const membership = data?.membership;
  const saved = data?.saved_jobs || [];
  const recommended = data?.recommended_jobs || [];
  const recent = data?.recent_jobs || [];
  const payments = data?.payments || [];

  const HScroll = ({ items }: { items: any[] }) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
      {items.map((j) => (
        <View key={j.job_id} style={{ width: 280 }}>
          <JobCard job={j} />
        </View>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Dashboard" />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 16, gap: 6 }}>
          <Text style={styles.welcome}>Welcome, {(user.full_name || "there").split(" ")[0]} 👋</Text>
          <Text style={styles.welcomeSub}>Here is your JobRadar snapshot.</Text>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <MembershipCard membership={membership} hidePlanName={!!launch?.plans_hidden} onRenew={launch?.plans_hidden ? undefined : () => router.push("/plans")} />
        </View>

        <View style={styles.block} testID="dashboard-career-tools">
          <SectionTitle title="Career Tools" action="Open" onAction={() => router.push("/career")} />
          <CareerToolsCards />
        </View>

        {recommended.length > 0 && (
          <View style={styles.block}>
            <SectionTitle title="Recommended for you" action="Explore" onAction={() => router.push("/explore")} />
          </View>
        )}
        {recommended.length > 0 && <HScroll items={recommended} />}

        <View style={styles.block}>
          <SectionTitle title="Recently Added" action="See all" onAction={() => router.push("/explore")} />
        </View>
        <HScroll items={recent} />

        <View style={styles.block}>
          <SectionTitle title="Saved Jobs" action="View" onAction={() => router.push("/saved")} />
          {saved.length === 0 ? (
            <Card><Text style={styles.info}>No saved jobs yet. Tap the bookmark on any job to save it.</Text></Card>
          ) : null}
        </View>
        {saved.length > 0 && <HScroll items={saved} />}

        <View style={styles.block}>
          <SectionTitle title={launch?.plans_hidden ? "Payments" : "Payment History"} />
          {launch?.plans_hidden ? (
            <Card><Text style={styles.info}>No payment needed — you have free access during our launch.</Text></Card>
          ) : payments.length === 0 ? (
            <Card><Text style={styles.info}>No payments yet.</Text></Card>
          ) : (
            <View style={{ gap: 10 }}>
              {payments.slice(0, 5).map((p: any) => (
                <Card key={p.payment_id} style={styles.payRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payPlan}>{p.plan_name}</Text>
                    <Text style={styles.payDate}>{formatDate(p.payment_date)}</Text>
                  </View>
                  <Text style={styles.payAmt}>{money(p.amount, p.currency)}</Text>
                  {p.is_demo ? <Badge label="DEMO" color="warning" /> : null}
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  welcome: { color: colors.onSurface, fontSize: 22, fontWeight: "900", letterSpacing: -0.4 },
  welcomeSub: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  block: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 12 },
  info: { color: colors.muted, fontSize: 14 },
  payRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  payPlan: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  payDate: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  payAmt: { color: colors.onSurface, fontSize: 15, fontWeight: "900" },
}));
