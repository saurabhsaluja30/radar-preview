import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api/client";
import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";
import { Card, Badge, Button, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { formatDate } from "@/src/utils/format";

export default function AdminEmails() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [compose, setCompose] = useState({ subject: "", message: "" });
  const [sending, setSending] = useState(false);

  const { data } = useQuery({ queryKey: ["admin-emails"], queryFn: () => api("/admin/emails") });
  const emails: any[] = data?.emails || [];

  const sendAnnouncement = async () => {
    if (!compose.subject || !compose.message) return toast.show("Enter subject and message", "error");
    setSending(true);
    try {
      const res = await api("/admin/announcement", { method: "POST", body: compose });
      toast.show(`Announcement sent to ${res.sent} candidates`, "success");
      setCompose({ subject: "", message: "" });
      qc.invalidateQueries({ queryKey: ["admin-emails"] });
    } catch (e: any) {
      toast.show(e.message || "Failed", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Email Management" />
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} bottomOffset={24} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: 12 }}>
          <Text style={styles.title}>Send Announcement</Text>
          <Input label="Subject" value={compose.subject} onChangeText={(v) => setCompose((c) => ({ ...c, subject: v }))} testID="email-subject" />
          <Input label="Message" value={compose.message} onChangeText={(v) => setCompose((c) => ({ ...c, message: v }))} multiline numberOfLines={4} style={{ minHeight: 90, textAlignVertical: "top" }} testID="email-message" />
          <Button title="Send to all candidates" onPress={sendAnnouncement} loading={sending} testID="email-send" />
        </Card>

        <Text style={[styles.title, { marginTop: 24, marginBottom: 12 }]}>Email Logs ({emails.length})</Text>
        <View style={{ gap: 8 }}>
          {emails.map((e) => (
            <Card key={e.email_id} testID={`email-log-${e.email_id}`}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subject} numberOfLines={1}>{e.subject}</Text>
                  <Text style={styles.meta}>{e.to} · {e.email_type}</Text>
                  <Text style={styles.meta}>{formatDate(e.date_sent)}</Text>
                </View>
                <Badge label={e.delivery_status} color={e.delivery_status === "sent" ? "success" : e.delivery_status === "failed" ? "error" : "info"} />
              </View>
            </Card>
          ))}
          {emails.length === 0 ? <Text style={styles.empty}>No emails logged yet.</Text> : null}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  title: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  subject: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 20 },
}));
