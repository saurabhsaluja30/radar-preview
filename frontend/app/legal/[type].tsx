import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader } from "@/src/components/Brand";

const DISCLAIMER =
  "JobRadar by EevolveX provides curated job information for discovery purposes only. We do not guarantee interviews, selection, employment, salary, or response from employers. Candidates are responsible for applying directly and verifying job information.";

const CONTENT: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "Terms & Conditions",
    body: [
      "By using JobRadar by EevolveX, you agree to these Terms. JobRadar is a paid curated job-discovery membership platform operated by EevolveX Consulting LLP.",
      "Membership fees provide access to curated job information and platform features. Membership does not guarantee an interview, job offer, employment, salary, or response from any employer.",
      "Jobs are curated from publicly available and legitimate sources. Candidates apply directly to employers and are responsible for verifying all job information.",
      "You agree to use the platform lawfully and not to misuse, scrape, or resell curated content.",
      "EevolveX may update plans, pricing, and features from time to time.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "We collect the information you provide during registration (name, email, mobile, preferences) to operate your account and personalise your experience.",
      "We use your email to send transactional and membership-related notifications.",
      "We do not sell your personal data. We may share limited data with service providers strictly to operate the platform.",
      "You can update your profile or request account changes at any time through the app.",
    ],
  },
  refund: {
    title: "Refund Policy",
    body: [
      "Membership fees are generally non-refundable once premium access has been activated, as access to curated content is granted immediately.",
      "If a payment was charged in error or a technical issue prevented access, contact support and we will review your case.",
      "Demo transactions carry no real charge and are not eligible for refunds.",
    ],
  },
  cancellation: {
    title: "Cancellation Policy",
    body: [
      "You may cancel your membership at any time. Your premium access will continue until the current expiry date.",
      "In demo mode, memberships do not auto-renew. When a real payment gateway is enabled, cancellation stops future renewals.",
      "Your account, saved jobs, and payment history are retained after cancellation.",
    ],
  },
  disclaimer: {
    title: "Disclaimer",
    body: [DISCLAIMER,
      "JobRadar is not a recruitment agency or marketplace and does not control any employer's application or hiring process.",
      "We do not claim that an application was successfully submitted unless the external employer confirms it.",
    ],
  },
};

export default function Legal() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type: string }>();
  const data = CONTENT[type || "terms"] || CONTENT.terms;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={data.title} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>{data.title}</Text>
        <View style={{ gap: 14, marginTop: 14 }}>
          {data.body.map((p, i) => (
            <Text key={i} style={styles.p}>{p}</Text>
          ))}
        </View>
        <View style={styles.links}>
          {Object.keys(CONTENT).map((k) => (
            <Text key={k} style={styles.linkNote}>{CONTENT[k].title}</Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h1: { color: colors.onSurface, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  p: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 22 },
  links: { marginTop: 24, gap: 4 },
  linkNote: { color: colors.muted, fontSize: 12, fontWeight: "600" },
}));
