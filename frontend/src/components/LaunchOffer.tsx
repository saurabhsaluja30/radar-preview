import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { GiftIcon, HourglassIcon } from "phosphor-react-native";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { Button, Card } from "@/src/components/ui";
import { makeStyles, useTheme } from "@/src/theme";
import { formatDate } from "@/src/utils/format";

export type LaunchOffer = {
  enabled: boolean;
  plans_hidden: boolean;
  free_days: number;
  spots_total: number;
  spots_left: number;
};

const PLACEHOLDER: LaunchOffer = { enabled: true, plans_hidden: true, free_days: 90, spots_total: 100, spots_left: -1 };

export function useLaunchOffer() {
  // While loading, or if the request fails, treat plans as hidden so paid wording never shows.
  const q = useQuery<LaunchOffer>({
    queryKey: ["launch-offer"],
    queryFn: () => api("/launch-offer", { auth: false }),
  });
  return { ...q, data: q.data ?? PLACEHOLDER, isPlaceholderData: !q.data };
}

/** Replaces membership plans while the free launch offer is running. */
export function LaunchOfferCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user, membership } = useAuth();
  const { data, isPlaceholderData } = useLaunchOffer();
  if (!data || isPlaceholderData) return null;
  const status = (user as any)?.launch_offer;
  const full = data.spots_left <= 0;

  let title = `Free for our first ${data.spots_total} members`;
  let body = `Register now and get free full access for ${data.free_days} days — curated jobs, direct apply links and Career Tools. ${data.spots_left} of ${data.spots_total} free spots left.`;
  let cta: { label: string; to: string } | null = { label: "Claim Free Access", to: "/auth/register" };
  let Icon = GiftIcon;

  if (user && (membership as any)?.is_active) {
    title = "You have free full access";
    body = `Enjoy every premium job and Career Tool until ${formatDate((membership as any).expiry_date)}.`;
    cta = { label: "Explore Jobs", to: "/explore" };
  } else if (user && status === "waitlisted") {
    title = "You're on the waitlist";
    body = "All free launch spots are taken. We'll email you as soon as your access is approved — no payment needed.";
    cta = null;
    Icon = HourglassIcon;
  } else if (user) {
    title = "Access not active yet";
    body = "Your free access is not active right now. Please contact support and we will help you.";
    cta = null;
    Icon = HourglassIcon;
  } else if (!data.enabled) {
    title = "Membership opening soon";
    body = "Membership plans are not open yet. Create a free account to browse job previews and we'll notify you when plans are available.";
    cta = { label: "Create Free Account", to: "/auth/register" };
    Icon = HourglassIcon;
  } else if (full) {
    title = "Free spots are full — join the waitlist";
    body = "All free launch spots have been claimed. Register to join the waitlist and we'll email you when your access is approved.";
    cta = { label: "Join the Waitlist", to: "/auth/register" };
    Icon = HourglassIcon;
  }

  return (
    <Card style={styles.card} testID="launch-offer-card">
      <View style={styles.icon}>
        <Icon size={24} color={colors.brandPrimary} weight="fill" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {cta ? <Button title={cta.label} onPress={() => router.push(cta!.to as any)} testID="launch-offer-cta" /> : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  card: { gap: 10, borderColor: colors.brandPrimary, borderWidth: 1.5 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
}));
