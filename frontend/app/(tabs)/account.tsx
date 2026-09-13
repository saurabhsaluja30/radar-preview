import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import {
  SquaresFour,
  CreditCard,
  UserGear,
  Info,
  Question,
  EnvelopeSimple,
  FileText,
  SignOut,
  ShieldStar,
  CaretRight,
  GoogleLogo,
} from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { BrandLogo } from "@/src/components/Brand";
import { Button } from "@/src/components/ui";
import { MembershipCard } from "@/src/components/MembershipCard";
import { useToast } from "@/src/components/Toast";

export default function Account() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, membership, logout, googleLogin, refresh } = useAuth();
  const toast = useToast();

  const doGoogle = async () => {
    try {
      await googleLogin();
    } catch {
      toast.show("Google sign-in failed", "error");
    }
  };

  if (!user) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: 24, paddingTop: insets.top + 32, gap: 16 }}
      >
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <BrandLogo size="lg" onLight />
        </View>
        <Text style={styles.welcomeTitle}>Welcome to JobRadar</Text>
        <Text style={styles.welcomeSub}>
          Sign in to access your dashboard, membership, and saved jobs.
        </Text>
        <Button title="Login" onPress={() => router.push("/auth/login")} testID="account-login-btn" />
        <Button
          title="Create an account"
          variant="outline"
          onPress={() => router.push("/auth/register")}
          testID="account-register-btn"
        />
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerTxt}>or</Text>
          <View style={styles.line} />
        </View>
        <Button
          title="Continue with Google"
          variant="secondary"
          onPress={doGoogle}
          testID="account-google-btn"
          icon={<GoogleLogo size={18} color={colors.brandPrimary} weight="bold" />}
        />
        <Pressable onPress={() => router.push("/admin")} style={{ marginTop: 8 }} testID="account-admin-link">
          <Text style={styles.adminLink}>Admin login</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const links = [
    { icon: SquaresFour, label: "Dashboard", to: "/dashboard" },
    { icon: CreditCard, label: "Membership & Plans", to: "/membership" },
    { icon: UserGear, label: "Edit Profile", to: "/profile" },
    { icon: Info, label: "About JobRadar", to: "/about" },
    { icon: Question, label: "FAQ", to: "/faq" },
    { icon: EnvelopeSimple, label: "Contact Support", to: "/contact" },
    { icon: FileText, label: "Legal & Policies", to: "/legal/terms" },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.profileHeader, { paddingTop: insets.top + 16 }]}>
        <View style={styles.avatar}>
          {user.picture ? (
            <Image source={{ uri: user.picture }} style={{ width: 60, height: 60, borderRadius: 30 }} />
          ) : (
            <Text style={styles.avatarTxt}>{(user.full_name || user.email || "?")[0]?.toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {user.full_name || "JobRadar Member"}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
        {user.role === "admin" ? (
          <Pressable onPress={() => router.push("/admin")} style={styles.adminChip} testID="account-admin-portal">
            <ShieldStar size={16} color={colors.onBrandPrimary} weight="fill" />
            <Text style={styles.adminChipTxt}>Admin</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
        <MembershipCard
          membership={membership}
          onRenew={() => router.push("/plans")}
        />
      </View>

      <View style={styles.linkList}>
        {links.map((l) => (
          <Pressable
            key={l.label}
            onPress={() => router.push(l.to as any)}
            style={styles.linkRow}
            testID={`account-link-${l.label}`}
          >
            <View style={styles.linkIcon}>
              <l.icon size={20} color={colors.brandPrimary} weight="duotone" />
            </View>
            <Text style={styles.linkTxt}>{l.label}</Text>
            <CaretRight size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
        <Button
          title="Log out"
          variant="outline"
          onPress={async () => {
            await logout();
            toast.show("Logged out", "info");
            router.replace("/(tabs)");
          }}
          testID="account-logout-btn"
          icon={<SignOut size={18} color={colors.brandPrimary} />}
        />
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  welcomeTitle: { color: colors.onSurface, fontSize: 24, fontWeight: "900", textAlign: "center" },
  welcomeSub: { color: colors.muted, fontSize: 14, textAlign: "center", marginBottom: 8, lineHeight: 20 },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerTxt: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  adminLink: { color: colors.muted, fontSize: 13, fontWeight: "700", textAlign: "center", textDecorationLine: "underline" },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "900" },
  name: { color: colors.onSurface, fontSize: 19, fontWeight: "900" },
  email: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 2 },
  adminChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  adminChipTxt: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  linkList: { paddingHorizontal: 16, marginTop: 20, gap: 4 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTxt: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "700" },
}));
