import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Target, MagnifyingGlass, ShieldCheck, PaperPlaneTilt } from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { ScreenHeader, BrandLogo } from "@/src/components/Brand";
import { Card } from "@/src/components/ui";

const POINTS = [
  { icon: Target, title: "Our objective", desc: "Reduce the time candidates spend searching across LinkedIn, portals, WhatsApp groups and company websites." },
  { icon: MagnifyingGlass, title: "Curated intelligence", desc: "Jobs are curated from publicly available and legitimate sources into one premium collection." },
  { icon: PaperPlaneTilt, title: "Direct applications", desc: "Candidates apply directly to employers using the provided links and public contact details." },
  { icon: ShieldCheck, title: "Honest positioning", desc: "We do not guarantee interviews, selection or employment — we provide discovery, not promises." },
];

export default function About() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScreenHeader title="About" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <BrandLogo size="lg" onLight />
        <Text style={styles.h1}>A premium career intelligence platform</Text>
        <Text style={styles.p}>
          JobRadar is powered by <Text style={styles.b}>EevolveX Consulting LLP</Text>. Instead of spending
          hours searching everywhere, members access a curated collection of relevant opportunities in one place.
        </Text>
        <View style={{ gap: 12, marginTop: 20 }}>
          {POINTS.map((pt) => (
            <Card key={pt.title} style={styles.row}>
              <View style={styles.icon}>
                <pt.icon size={22} color={colors.brandPrimary} weight="duotone" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{pt.title}</Text>
                <Text style={styles.desc}>{pt.desc}</Text>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  h1: { color: colors.onSurface, fontSize: 24, fontWeight: "900", marginTop: 20, letterSpacing: -0.5 },
  p: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 23, marginTop: 10 },
  b: { fontWeight: "800", color: colors.onSurface },
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  desc: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
}));
