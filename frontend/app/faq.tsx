import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretDown, CaretUp } from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";

const FAQS = [
  ["What is JobRadar?", "JobRadar is a paid curated job-discovery membership platform by Evolveminds. We collect relevant job opportunities from public sources so you can discover and apply faster."],
  ["Is this a recruitment agency?", "No. JobRadar is not a recruitment agency or marketplace. We provide curated job information for discovery only; you apply directly to employers."],
  ["Does membership guarantee a job?", "No. Membership provides access to curated job information and platform features. It does not guarantee interviews, selection, employment or any response from employers."],
  ["How do I apply for a job?", "Open any job as an active member and tap Apply Now to reach the employer's official application link or public contact details."],
  ["Can I cancel my membership?", "Yes. You can cancel anytime; your access continues until the current expiry date."],
  ["What happens when my membership expires?", "Your account, saved jobs and payment history are retained, but premium job details are locked until you renew."],
  ["Can I renew before expiry?", "Yes. If you renew early, the new duration is added on top of your remaining days — you never lose active time."],
  ["Are all jobs verified?", "Jobs are curated from publicly available sources and carry a quality indicator, but candidates should always verify details independently."],
  ["Can I get a refund?", "Membership fees are generally non-refundable once premium access is activated. Please review our Refund Policy."],
  ["How do I contact support?", "Use the Contact page in the app to reach our support team."],
];

export default function FAQ() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={styles.screen}>
      <ScreenHeader title="FAQ" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Frequently Asked Questions</Text>
        <View style={{ gap: 10, marginTop: 16 }}>
          {FAQS.map(([q, a], i) => (
            <Pressable key={q} onPress={() => setOpen(open === i ? null : i)} style={styles.item} testID={`faq-${i}`}>
              <View style={styles.qRow}>
                <Text style={styles.q}>{q}</Text>
                {open === i ? <CaretUp size={18} color={colors.brandPrimary} /> : <CaretDown size={18} color={colors.muted} />}
              </View>
              {open === i ? <Text style={styles.a}>{a}</Text> : null}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h1: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  item: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
  qRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  q: { flex: 1, color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  a: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginTop: 10 },
}));
