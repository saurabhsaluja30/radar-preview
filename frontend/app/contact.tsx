import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EnvelopeSimple, Buildings, Question } from "phosphor-react-native";
import { useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Button, Input, Card } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

const SUPPORT_EMAIL = "support@eevolvex.com";

export default function Contact() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [loading, setLoading] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.email || !form.message) return toast.show("Please fill all fields", "error");
    setLoading(true);
    try {
      await api("/contact", { method: "POST", body: form, auth: false });
      toast.show("Message sent! We'll be in touch.", "success");
      setForm({ name: "", email: "", message: "" });
    } catch {
      toast.show("Failed to send message", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Contact" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} bottomOffset={24} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Get in touch</Text>
        <Card style={{ marginTop: 14, gap: 12 }}>
          <View style={styles.row}>
            <Buildings size={20} color={colors.brandPrimary} weight="duotone" />
            <Text style={styles.rowTxt}>EevolveX Consulting LLP</Text>
          </View>
          <View style={styles.row}>
            <EnvelopeSimple size={20} color={colors.brandPrimary} weight="duotone" />
            <Text style={styles.rowTxt} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>{SUPPORT_EMAIL}</Text>
          </View>
          <View style={styles.row}>
            <Question size={20} color={colors.brandPrimary} weight="duotone" />
            <Text style={[styles.rowTxt, styles.link]} onPress={() => router.push("/faq")}>Visit our FAQ</Text>
          </View>
        </Card>

        <Text style={[styles.h1, { marginTop: 24, fontSize: 18 }]}>Send us a message</Text>
        <View style={{ gap: 14, marginTop: 12 }}>
          <Input label="Name" value={form.name} onChangeText={(v) => set("name", v)} testID="contact-name" />
          <Input label="Email" value={form.email} onChangeText={(v) => set("email", v)} keyboardType="email-address" autoCapitalize="none" testID="contact-email" />
          <Input label="Message" value={form.message} onChangeText={(v) => set("message", v)} multiline numberOfLines={4} style={{ minHeight: 100, textAlignVertical: "top" }} testID="contact-message" />
          <Button title="Send Message" onPress={submit} loading={loading} testID="contact-submit" />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h1: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTxt: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  link: { color: colors.brandPrimary, textDecorationLine: "underline" },
}));
