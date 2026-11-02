import React from "react";
import { Text, View } from "react-native";
import { Info } from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { OPPORTUNITY_NOTICE, OPPORTUNITY_NOTICE_FREE } from "@/src/constants";
import { useLaunchOffer } from "@/src/components/LaunchOffer";

// Clearly-visible pre-payment notice shown on pricing, membership and registration.
export function OpportunityNotice({ testID }: { testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data: launch } = useLaunchOffer();
  return (
    <View style={styles.box} testID={testID || "opportunity-notice"}>
      <View style={styles.head}>
        <Info size={18} color={colors.brandPrimary} weight="fill" />
        <Text style={styles.title}>What opportunities will you get?</Text>
      </View>
      <Text style={styles.body}>{launch?.plans_hidden ? OPPORTUNITY_NOTICE_FREE : OPPORTUNITY_NOTICE}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.onSurfaceTertiary, fontSize: 15, fontWeight: "800", flex: 1 },
  body: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
}));
