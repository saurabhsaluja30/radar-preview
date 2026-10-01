import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import {
  UsersThree,
  ChartLineUp,
  Gear,
  AirplaneTilt,
  Handshake,
  Code,
  Briefcase,
  UserPlus,
  CreditCard,
  Sparkle,
  PaperPlaneTilt,
  CheckCircle,
  ShieldCheck,
} from "phosphor-react-native";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { BrandLogo } from "@/src/components/Brand";
import { Button, Card } from "@/src/components/ui";
import { CATEGORIES, INDUSTRIES, INDUSTRY_SHORT } from "@/src/constants";
import { money } from "@/src/utils/format";

const HERO =
  "https://images.unsplash.com/photo-1768101225267-c6fc5678c113?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const CAT_ICON: Record<string, any> = {
  "HR & Recruitment": UsersThree,
  "Finance & Accounting": ChartLineUp,
  "IT & Technology": Code,
  "Travel & Hospitality": AirplaneTilt,
  "BPO / Customer Experience": Gear,
};

const STEPS = [
  { icon: UserPlus, title: "Register", desc: "Create your free JobRadar account in seconds." },
  { icon: CreditCard, title: "Choose a membership", desc: "Pick a plan that fits your job search." },
  { icon: Sparkle, title: "Discover curated jobs", desc: "Browse hand-picked, relevant opportunities." },
  { icon: PaperPlaneTilt, title: "Apply directly", desc: "Apply to employers using direct links." },
];

const WHY = [
  "Curated opportunities, not endless listings",
  "Saves hours of job-search time",
  "Direct application links to employers",
  "Regularly updated fresh listings",
  "Premium member-only access",
  "No false employment promises",
];

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data: cfg } = useQuery({ queryKey: ["config"], queryFn: () => api("/config", { auth: false }) });
  const { data: plansData } = useQuery({ queryKey: ["plans"], queryFn: () => api("/plans", { auth: false }) });
  const plans: any[] = plansData?.plans || [];

  return (
    <View style={styles.screen}>
      {/* Sticky header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <BrandLogo size="sm" onLight />
        <Pressable
          testID="header-login-btn"
          onPress={() => router.push(user ? "/account" : "/auth/login")}
          style={styles.headerBtn}
        >
          <Text style={styles.headerBtnTxt}>{user ? "Account" : "Login"}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        testID="home-scroll"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Image source={{ uri: HERO }} style={styles.heroImg} contentFit="cover" />
          <LinearGradient
            colors={["rgba(76,29,149,0.72)", "rgba(76,29,149,0.94)"]}
            style={styles.heroOverlay}
          />
          <View style={styles.heroContent}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillTxt}>Premium Curated Job Intelligence</Text>
            </View>
            <Text style={styles.heroTitle}>Stop Searching.{"\n"}Start Discovering.</Text>
            <Text style={styles.heroSub}>
              Access carefully curated job opportunities across high-demand functions and apply directly
              to employers.
            </Text>
            <View style={styles.heroBtns}>
              <Button
                title="Explore Jobs"
                onPress={() => router.push("/explore")}
                fullWidth={false}
                testID="hero-explore-btn"
              />
              <Button
                title="View Membership Plans"
                variant="secondary"
                fullWidth={false}
                onPress={() => router.push("/plans")}
                testID="hero-plans-btn"
              />
            </View>
          </View>
        </View>

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={{ gap: 12 }}>
            {STEPS.map((s, i) => (
              <View key={s.title} style={styles.step}>
                <View style={styles.stepNum}>
                  <s.icon size={22} color={colors.brandPrimary} weight="duotone" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>
                    Step {i + 1}: {s.title}
                  </Text>
                  <Text style={styles.stepDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Job Categories</Text>
          <View style={styles.grid}>
            {INDUSTRIES.map((c) => {
              const Icon = CAT_ICON[c] || Briefcase;
              return (
                <Pressable
                  key={c}
                  testID={`category-${c}`}
                  onPress={() => router.push({ pathname: "/explore", params: { industry_category: c } })}
                  style={styles.catCard}
                >
                  <View style={styles.catIcon}>
                    <Icon size={24} color={colors.brandPrimary} weight="duotone" />
                  </View>
                  <Text style={styles.catTxt}>{INDUSTRY_SHORT[c] || c}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.grid, { marginTop: 12 }]}>
            <Pressable
              testID="region-india"
              onPress={() => router.push({ pathname: "/explore", params: { region: "India" } })}
              style={[styles.catCard, { backgroundColor: colors.surfaceTertiary }]}
            >
              <View style={styles.catIcon}>
                <Briefcase size={24} color={colors.brandPrimary} weight="duotone" />
              </View>
              <Text style={styles.catTxt}>India Jobs</Text>
            </Pressable>
            <Pressable
              testID="region-international"
              onPress={() => router.push({ pathname: "/explore", params: { region: "International" } })}
              style={[styles.catCard, { backgroundColor: colors.surfaceTertiary }]}
            >
              <View style={styles.catIcon}>
                <AirplaneTilt size={24} color={colors.brandPrimary} weight="duotone" />
              </View>
              <Text style={styles.catTxt}>International Jobs</Text>
            </Pressable>
          </View>
        </View>

        {/* Why JobRadar */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Why JobRadar</Text>
          <Card>
            <View style={{ gap: 12 }}>
              {WHY.map((w) => (
                <View key={w} style={styles.whyRow}>
                  <CheckCircle size={20} color={colors.success} weight="fill" />
                  <Text style={styles.whyTxt}>{w}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* Membership plans preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Membership Plans</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingRight: 16 }}
          >
            {plans.map((p) => (
              <Pressable
                key={p.plan_id}
                testID={`home-plan-${p.plan_id}`}
                onPress={() => router.push("/plans")}
                style={[styles.planCard, p.featured && styles.planCardFeatured]}
              >
                {p.featured ? (
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeTxt}>Recommended</Text>
                  </View>
                ) : null}
                <Text style={styles.planName}>{p.name}</Text>
                <Text style={styles.planPrice}>{money(p.price, p.currency)}</Text>
                <Text style={styles.planDur}>{p.duration_days} days access</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ marginTop: 16 }}>
            <Button title="Become a Member" onPress={() => router.push("/plans")} testID="become-member-btn" />
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.section}>
          <View style={styles.disclaimer}>
            <ShieldCheck size={20} color={colors.muted} weight="duotone" />
            <Text style={styles.disclaimerTxt}>{cfg?.disclaimer}</Text>
          </View>
          <View style={styles.footerLinks}>
            {[
              ["About", "/about"],
              ["FAQ", "/faq"],
              ["Contact", "/contact"],
              ["Terms", "/legal/terms"],
              ["Privacy", "/legal/privacy"],
              ["Refund", "/legal/refund"],
            ].map(([label, href]) => (
              <Pressable key={label} onPress={() => router.push(href as any)} testID={`footer-${label}`}>
                <Text style={styles.footerLink}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.footerBrand}>JobRadar by Evolveminds · Stop Searching. Start Discovering.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerBtn: {
    backgroundColor: colors.surfaceTertiary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  headerBtnTxt: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  hero: { height: 360, justifyContent: "flex-end" },
  heroImg: { ...StyleSheetAbsolute() },
  heroOverlay: { ...StyleSheetAbsolute() },
  heroContent: { padding: 22, gap: 12 },
  heroPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroPillTxt: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  heroTitle: { color: "#FFFFFF", fontSize: 32, fontWeight: "900", lineHeight: 38, letterSpacing: -0.5 },
  heroSub: { color: "#EDE9FE", fontSize: 14, lineHeight: 20 },
  heroBtns: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  section: { paddingHorizontal: 16, paddingTop: 28 },
  sectionTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginBottom: 16, letterSpacing: -0.4 },
  step: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    padding: 14,
    borderRadius: 16,
  },
  stepNum: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  stepDesc: { color: colors.muted, fontSize: 13, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  catCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  catTxt: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  whyRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  whyTxt: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600", flex: 1 },
  planCard: {
    width: 180,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 4,
  },
  planCardFeatured: { borderColor: colors.brandPrimary, backgroundColor: colors.surfaceTertiary },
  planBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  planBadgeTxt: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "800" },
  planName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  planPrice: { color: colors.brandPrimary, fontSize: 26, fontWeight: "900" },
  planDur: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  disclaimer: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
    padding: 14,
    borderRadius: 14,
  },
  disclaimerTxt: { color: colors.muted, fontSize: 12, lineHeight: 18, flex: 1 },
  footerLinks: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 20, justifyContent: "center" },
  footerLink: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700" },
  footerBrand: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 16, fontWeight: "600" },
}));

function StyleSheetAbsolute() {
  return { position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0 };
}
