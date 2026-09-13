import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleLogo } from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Input } from "@/src/components/ui";
import { BrandLogo, ScreenHeader } from "@/src/components/Brand";
import { useToast } from "@/src/components/Toast";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, googleLogin } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      toast.show("Enter email and password", "error");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.show("Welcome back!", "success");
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e.message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    try {
      await googleLogin();
      router.replace("/(tabs)");
    } catch {
      toast.show("Google sign-in failed", "error");
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Login" />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }}
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", marginVertical: 16 }}>
          <BrandLogo size="lg" onLight />
        </View>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.sub}>Login to access curated jobs and your membership.</Text>

        <View style={{ gap: 14, marginTop: 24 }}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            testID="login-email"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            testID="login-password"
          />
          <Pressable onPress={() => router.push("/auth/forgot")} style={{ alignSelf: "flex-end" }} testID="forgot-link">
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>
          <Button title="Login" onPress={submit} loading={loading} testID="login-submit" />
        </View>

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerTxt}>or</Text>
          <View style={styles.line} />
        </View>

        <Button
          title="Continue with Google"
          variant="secondary"
          onPress={google}
          testID="login-google"
          icon={<GoogleLogo size={18} color={colors.brandPrimary} weight="bold" />}
        />

        <View style={styles.footer}>
          <Text style={styles.footerTxt}>New to JobRadar? </Text>
          <Pressable onPress={() => router.replace("/auth/register")} testID="go-register">
            <Text style={styles.footerLink}>Create an account</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: 24, fontWeight: "900", textAlign: "center" },
  sub: { color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 6 },
  forgot: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 20 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerTxt: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24 },
  footerTxt: { color: colors.muted, fontSize: 14 },
  footerLink: { color: colors.brandPrimary, fontSize: 14, fontWeight: "800" },
}));
