import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckSquare, Square } from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Input, Chip } from "@/src/components/ui";
import { ScreenHeader } from "@/src/components/Brand";
import { useToast } from "@/src/components/Toast";
import { CATEGORIES, EXPERIENCE_RANGES } from "@/src/constants";

export default function Register() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    mobile: "",
    password: "",
    confirm_password: "",
    preferred_function: "",
    preferred_location: "",
    preferred_experience: "",
  });
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.full_name || !form.email || !form.mobile || !form.password) {
      toast.show("Please fill all required fields", "error");
      return;
    }
    if (form.password !== form.confirm_password) {
      toast.show("Passwords do not match", "error");
      return;
    }
    if (!consent) {
      toast.show("Please accept the Terms & Privacy Policy", "error");
      return;
    }
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim(), consent });
      toast.show("Account created!", "success");
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e.message || "Registration failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Create Account" />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Join JobRadar</Text>
        <Text style={styles.sub}>Create your account to discover curated opportunities.</Text>

        <View style={{ gap: 14, marginTop: 22 }}>
          <Input label="Full Name *" value={form.full_name} onChangeText={(v) => set("full_name", v)} placeholder="Your name" testID="reg-name" />
          <Input label="Email *" value={form.email} onChangeText={(v) => set("email", v)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" testID="reg-email" />
          <Input label="Mobile Number *" value={form.mobile} onChangeText={(v) => set("mobile", v)} placeholder="10-digit mobile" keyboardType="phone-pad" testID="reg-mobile" />
          <Input label="Password *" value={form.password} onChangeText={(v) => set("password", v)} placeholder="Min 6 characters" secureTextEntry testID="reg-password" />
          <Input label="Confirm Password *" value={form.confirm_password} onChangeText={(v) => set("confirm_password", v)} placeholder="Re-enter password" secureTextEntry testID="reg-confirm" />

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Preferred Function</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c.split(" & ")[0]} selected={form.preferred_function === c} onPress={() => set("preferred_function", form.preferred_function === c ? "" : c)} testID={`reg-func-${c}`} />
              ))}
            </ScrollView>
          </View>

          <Input label="Preferred Location" value={form.preferred_location} onChangeText={(v) => set("preferred_location", v)} placeholder="e.g. Bengaluru" testID="reg-location" />

          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Preferred Experience</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {EXPERIENCE_RANGES.map((e) => (
                <Chip key={e} label={e} selected={form.preferred_experience === e} onPress={() => set("preferred_experience", form.preferred_experience === e ? "" : e)} testID={`reg-exp-${e}`} />
              ))}
            </ScrollView>
          </View>

          <Pressable style={styles.consent} onPress={() => setConsent((c) => !c)} testID="reg-consent">
            {consent ? (
              <CheckSquare size={24} color={colors.brandPrimary} weight="fill" />
            ) : (
              <Square size={24} color={colors.muted} />
            )}
            <Text style={styles.consentTxt}>
              I agree to the <Text style={styles.link} onPress={() => router.push("/legal/terms")}>Terms</Text> and{" "}
              <Text style={styles.link} onPress={() => router.push("/legal/privacy")}>Privacy Policy</Text>.
            </Text>
          </Pressable>

          <Button title="Create Account" onPress={submit} loading={loading} testID="reg-submit" />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTxt}>Already have an account? </Text>
          <Pressable onPress={() => router.replace("/auth/login")} testID="go-login">
            <Text style={styles.footerLink}>Login</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "900" },
  sub: { color: colors.muted, fontSize: 14, marginTop: 6 },
  label: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  consent: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 4 },
  consentTxt: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  link: { color: colors.brandPrimary, fontWeight: "800" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  footerTxt: { color: colors.muted, fontSize: 14 },
  footerLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "800" },
}));
