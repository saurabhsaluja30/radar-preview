import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { Button, Input } from "@/src/components/ui";
import { ScreenHeader } from "@/src/components/Brand";
import { useToast } from "@/src/components/Toast";

export default function Forgot() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const requestCode = async () => {
    if (!email) return toast.show("Enter your email", "error");
    setLoading(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() }, auth: false });
      toast.show("If the account exists, a reset code was sent", "success");
      setStep(2);
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (!token || !password) return toast.show("Enter code and new password", "error");
    setLoading(true);
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: { email: email.trim(), token: token.trim().toUpperCase(), new_password: password },
        auth: false,
      });
      toast.show("Password reset! Please login", "success");
      router.replace("/auth/login");
    } catch (e: any) {
      toast.show(e.message || "Reset failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Reset Password" />
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }}
        bottomOffset={24}
      >
        <Text style={styles.title}>{step === 1 ? "Forgot your password?" : "Enter reset code"}</Text>
        <Text style={styles.sub}>
          {step === 1
            ? "We'll email you a reset code to set a new password."
            : "Check your email for the 8-character reset code."}
        </Text>

        {step === 1 ? (
          <View style={{ gap: 14, marginTop: 22 }}>
            <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" testID="forgot-email" />
            <Button title="Send Reset Code" onPress={requestCode} loading={loading} testID="forgot-send" />
          </View>
        ) : (
          <View style={{ gap: 14, marginTop: 22 }}>
            <Input label="Reset Code" value={token} onChangeText={setToken} placeholder="8-character code" autoCapitalize="characters" testID="reset-code" />
            <Input label="New Password" value={password} onChangeText={setPassword} placeholder="Min 6 characters" secureTextEntry testID="reset-password" />
            <Button title="Reset Password" onPress={reset} loading={loading} testID="reset-submit" />
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  sub: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
}));
