import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, CircleIcon as Circle, Sparkle } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button } from "@/src/components/ui";
import { ScreenHeader } from "@/src/components/Brand";
import { OpportunityNotice } from "@/src/components/OpportunityNotice";
import { useToast } from "@/src/components/Toast";
import { money } from "@/src/utils/format";
import { LaunchOfferCard, useLaunchOffer } from "@/src/components/LaunchOffer";

const BENEFITS = [
  "Full curated job descriptions",
  "Recruiter contact where available",
  "Direct application links",
  "Save unlimited jobs",
  "Regularly updated listings",
];

export default function Plans() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { data: launch } = useLaunchOffer();

  const { data } = useQuery({ queryKey: ["plans"], queryFn: () => api("/plans", { auth: false }) });
  const plans: any[] = data?.plans || [];
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: memData } = useQuery({
    queryKey: ["membership"],
    queryFn: () => api("/membership"),
    enabled: !!user,
  });
  const mem = memData?.membership;

  useEffect(() => {
    if (plans.length && !selected) {
      const current = mem?.is_active ? plans.find((p) => p.plan_id === mem.plan_id) : null;
      const rec = current || plans.find((p) => p.featured) || plans[0];
      setSelected(rec.plan_id);
    }
  }, [plans, selected, mem]);

  useEffect(() => {
    if (mem?.is_active && mem.plan_id) setSelected(mem.plan_id);
  }, [mem?.is_active, mem?.plan_id]);

  const maxDuration = Math.max(...plans.map((p) => p.duration_days || 0), 0);
  const curPlan = mem?.is_active ? plans.find((p) => p.plan_id === mem.plan_id) : null;
  const selPlan = plans.find((p) => p.plan_id === selected);
  const isDowngrade = !!(curPlan && selPlan && selPlan.duration_days < curPlan.duration_days);
  const changeNote =
    mem?.is_active && selPlan
      ? selPlan.plan_id === mem.plan_id
        ? `Renewal: ${selPlan.duration_days} days will be added after your current expiry (${String(mem.expiry_date).slice(0, 10)}).`
        : isDowngrade
          ? `You can switch to the ${selPlan.name} after your current ${mem.plan_name} expires (${String(mem.expiry_date).slice(0, 10)}).`
          : `Upgrade: your ${mem.plan_name} will be replaced. The ${selPlan.name} starts today and is valid for ${selPlan.duration_days} days.`
      : null;

  const checkout = async () => {
    if (!user) {
      toast.show("Please login to continue", "info");
      router.push("/auth/login");
      return;
    }
    if (!selected) return;
    setLoading(true);
    try {
      await api("/checkout/demo", { method: "POST", body: { plan_id: selected } });
      await refresh();
      toast.show("Membership activated (Demo)", "success");
      router.replace("/membership");
    } catch (e: any) {
      toast.show(e.message || "Payment failed", "error");
    } finally {
      setLoading(false);
    }
  };

  if (launch?.plans_hidden) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Membership" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40 }}>
          <LaunchOfferCard />
          <OpportunityNotice />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Membership Plans" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 170 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Unlock Premium Job Discovery</Text>
        <Text style={styles.sub}>
          Save hours of searching. Get curated opportunities and apply directly to employers.
        </Text>

        <View style={styles.demoBanner}>
          <Sparkle size={16} color={colors.warning} weight="fill" />
          <Text style={styles.demoTxt}>Demo mode — no real payment is charged.</Text>
        </View>
        {changeNote ? (
          <View style={[styles.demoBanner, { marginTop: 10 }]} testID="plan-change-note">
            <Text style={styles.noteTxt}>{changeNote}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <OpportunityNotice />
        </View>

        <View style={{ gap: 14, marginTop: 18 }}>
          {plans.map((p) => {
            const isSel = selected === p.plan_id;
            const isBest = p.duration_days === maxDuration && plans.length > 1;
            return (
              <Pressable
                key={p.plan_id}
                testID={`plan-${p.plan_id}`}
                onPress={() => setSelected(p.plan_id)}
                style={[styles.plan, isSel && styles.planSel]}
              >
                <View style={styles.planHead}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.badgeRow}>
                      {p.featured ? (
                        <View style={styles.recBadge}>
                          <Text style={styles.recTxt}>Recommended</Text>
                        </View>
                      ) : null}
                      {isBest ? (
                        <View style={[styles.recBadge, { backgroundColor: colors.success }]}>
                          <Text style={styles.recTxt}>Best Value</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.planName}>{p.name}</Text>
                    <Text style={styles.planDur}>{p.duration_days} days access</Text>
                  </View>
                  {isSel ? (
                    <CheckCircle size={26} color={colors.brandPrimary} weight="fill" />
                  ) : (
                    <Circle size={26} color={colors.border} weight="bold" />
                  )}
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.price}>{money(p.price, p.currency)}</Text>
                  {p.tagline ? <Text style={styles.tagline}>{p.tagline}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.benefits}>
          <Text style={styles.benefitsTitle}>Every plan includes</Text>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <CheckCircle size={18} color={colors.success} weight="fill" />
              <Text style={styles.benefitTxt}>{b}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.policy}>
          Membership fees provide access to curated job information and platform features. Membership does not
          guarantee an interview, job offer, employment, salary, or response from any employer.
        </Text>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {changeNote ? (
          <Text style={styles.noteTxt} numberOfLines={3} testID="plan-change-note-bottom">
            {changeNote}
          </Text>
        ) : null}
        <Button
          title={isDowngrade ? "Available after current plan expires" : loading ? "Processing…" : "Continue to Payment"}
          onPress={checkout}
          loading={loading}
          disabled={isDowngrade}
          testID="checkout-btn"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h1: { color: colors.onSurface, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  sub: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  demoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  demoTxt: { color: colors.warning, fontSize: 13, fontWeight: "700" },
  noteTxt: { color: colors.onSurface, fontSize: 13, fontWeight: "600", lineHeight: 18, marginBottom: 8 },
  plan: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
  },
  planSel: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  planHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  badgeRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  recBadge: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  recTxt: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "800" },
  planName: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  planDur: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 10 },
  price: { color: colors.brandPrimary, fontSize: 30, fontWeight: "900" },
  tagline: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  benefits: { marginTop: 24, backgroundColor: colors.surfaceSecondary, borderRadius: 18, padding: 18, gap: 12 },
  benefitsTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginBottom: 2 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitTxt: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  policy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 20 },
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
