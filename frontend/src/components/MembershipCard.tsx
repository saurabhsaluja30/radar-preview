import React from "react";
import { Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { MEMBERSHIP_UI } from "@/src/constants";
import { formatDate } from "@/src/utils/format";
import { Button } from "@/src/components/ui";

export function MembershipCard({
  membership,
  onRenew,
  hidePlanName,
}: {
  membership: any;
  onRenew?: () => void;
  hidePlanName?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const ui = MEMBERSHIP_UI[membership?.status] || MEMBERSHIP_UI.no_membership;
  const bg = colors[ui.color];
  const showRenew = ["expiring_soon", "expired", "no_membership", "cancelled", "payment_failed"].includes(
    membership?.status,
  );

  return (
    <View style={[styles.card, { backgroundColor: bg }]} testID="membership-status-card">
      <View style={styles.topRow}>
        <View style={styles.pill}>
          <Text style={styles.pillTxt}>{ui.label}</Text>
        </View>
        {membership?.is_demo && !hidePlanName ? (
          <View style={styles.demoPill}>
            <Text style={styles.demoTxt}>DEMO</Text>
          </View>
        ) : null}
      </View>

      {membership?.is_active ? (
        <>
          <Text style={styles.plan}>{hidePlanName ? "Full Access" : membership.plan_name}</Text>
          <Text style={styles.days}>
            {membership.days_remaining} day{membership.days_remaining === 1 ? "" : "s"} remaining
          </Text>
          <View style={styles.dates}>
            <View>
              <Text style={styles.dateLabel}>Started</Text>
              <Text style={styles.dateVal}>{formatDate(membership.start_date)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.dateLabel}>Expires</Text>
              <Text style={styles.dateVal}>{formatDate(membership.expiry_date)}</Text>
            </View>
          </View>
        </>
      ) : (
        <Text style={styles.hint}>{ui.hint}</Text>
      )}

      {showRenew && onRenew ? (
        <View style={{ marginTop: 14 }}>
          <Button
            title={membership?.status === "no_membership" ? "Become a Member" : "Renew Membership"}
            variant="secondary"
            onPress={onRenew}
            testID="membership-renew-btn"
          />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  card: { borderRadius: 22, padding: 20 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pill: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  pillTxt: { color: "#FFFFFF", fontWeight: "800", fontSize: 12, letterSpacing: 0.3 },
  demoPill: {
    backgroundColor: "rgba(0,0,0,0.22)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  demoTxt: { color: "#FFFFFF", fontWeight: "800", fontSize: 10, letterSpacing: 1 },
  plan: { color: "#FFFFFF", fontSize: 22, fontWeight: "900", marginTop: 12 },
  days: { color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "700", marginTop: 2 },
  dates: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.25)",
    paddingTop: 12,
  },
  dateLabel: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700" },
  dateVal: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", marginTop: 2 },
  hint: { color: "rgba(255,255,255,0.95)", fontSize: 14, fontWeight: "600", marginTop: 12, lineHeight: 20 },
}));
