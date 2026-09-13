import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Briefcase,
  UsersThree,
  CreditCard,
  Receipt,
  EnvelopeSimple,
  Flask,
  ShieldStar,
  SignOut,
  CaretRight,
} from "phosphor-react-native";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Input, Card } from "@/src/components/ui";
import { BrandLogo } from "@/src/components/Brand";
import { useToast } from "@/src/components/Toast";
import { money } from "@/src/utils/format";

export default function AdminHome() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <AdminLogin />;
  return <AdminDashboard />;
}

function AdminLogin() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { adminLogin } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await adminLogin(email.trim(), password);
      toast.show("Admin logged in", "success");
    } catch (e: any) {
      toast.show(e.message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 40 }} bottomOffset={24}>
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <View style={styles.adminBadge}>
            <ShieldStar size={30} color="#FFFFFF" weight="fill" />
          </View>
          <Text style={styles.h1}>Admin Portal</Text>
          <Text style={styles.sub}>JobRadar by EevolveX</Text>
        </View>
        <View style={{ gap: 14 }}>
          <Input label="Admin Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" testID="admin-email" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry testID="admin-password" />
          <Button title="Login as Admin" onPress={submit} loading={loading} testID="admin-login-submit" />
          <Pressable onPress={() => router.replace("/(tabs)")} testID="admin-back-home">
            <Text style={styles.link}>← Back to app</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function AdminDashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api("/admin/dashboard") });

  const metrics = [
    { label: "Candidates", value: data?.total_candidates ?? "—" },
    { label: "Active Members", value: data?.active_members ?? "—" },
    { label: "Expired", value: data?.expired_members ?? "—" },
    { label: "New (7d)", value: data?.new_registrations_week ?? "—" },
    { label: "Real Revenue", value: money(data?.real_revenue) },
    { label: "Demo Revenue", value: money(data?.demo_revenue) },
    { label: "Jobs Published", value: data?.jobs_published ?? "—" },
    { label: "Job Views", value: data?.total_job_views ?? "—" },
  ];

  const nav = [
    { icon: Flask, label: "Developer Test Panel", to: "/admin/dev-panel", accent: true },
    { icon: Briefcase, label: "Job Management", to: "/admin/jobs" },
    { icon: UsersThree, label: "Candidates", to: "/admin/candidates" },
    { icon: CreditCard, label: "Subscriptions", to: "/admin/subscriptions" },
    { icon: Receipt, label: "Payments", to: "/admin/payments" },
    { icon: EnvelopeSimple, label: "Email Logs", to: "/admin/emails" },
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <BrandLogo size="sm" />
        <Pressable
          onPress={async () => {
            await logout();
            router.replace("/(tabs)");
          }}
          testID="admin-logout"
          style={styles.logoutBtn}
        >
          <SignOut size={18} color="#FFFFFF" />
          <Text style={styles.logoutTxt}>Logout</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Dashboard</Text>
        <View style={styles.grid}>
          {metrics.map((m) => (
            <View key={m.label} style={styles.metric} testID={`metric-${m.label}`}>
              <Text style={styles.metricVal}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>

        {data?.popular_plan ? (
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.info}>Most popular plan: <Text style={{ fontWeight: "900", color: colors.brandPrimary }}>{data.popular_plan}</Text></Text>
          </Card>
        ) : null}

        <Text style={[styles.title, { marginTop: 24 }]}>Manage</Text>
        <View style={{ gap: 10 }}>
          {nav.map((n) => (
            <Pressable key={n.label} onPress={() => router.push(n.to as any)} style={[styles.navRow, n.accent && styles.navAccent]} testID={`admin-nav-${n.label}`}>
              <View style={[styles.navIcon, n.accent && { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <n.icon size={22} color={n.accent ? "#FFFFFF" : colors.brandPrimary} weight="duotone" />
              </View>
              <Text style={[styles.navTxt, n.accent && { color: "#FFFFFF" }]}>{n.label}</Text>
              <CaretRight size={18} color={n.accent ? "#FFFFFF" : colors.muted} />
            </Pressable>
          ))}
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
    paddingBottom: 12,
    backgroundColor: colors.surfaceInverse,
  },
  logoutBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  logoutTxt: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  adminBadge: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  h1: { color: colors.onSurface, fontSize: 24, fontWeight: "900" },
  sub: { color: colors.muted, fontSize: 14, marginTop: 4 },
  link: { color: colors.brandPrimary, fontWeight: "700", textAlign: "center", marginTop: 8 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginBottom: 14, letterSpacing: -0.4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.border },
  metricVal: { color: colors.brandPrimary, fontSize: 22, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  info: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },
  navRow: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.border },
  navAccent: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  navIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  navTxt: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "800" },
}));
