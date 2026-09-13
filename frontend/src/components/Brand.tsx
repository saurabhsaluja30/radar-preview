import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Broadcast } from "phosphor-react-native";

import { makeStyles, useTheme } from "@/src/theme";

// Text + radar-icon brand logo used across headers. Swap the icon with the
// uploaded EevolveX logo image once provided.
export function BrandLogo({
  size = "md",
  onLight = false,
}: {
  size?: "sm" | "md" | "lg";
  onLight?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const iconSize = size === "sm" ? 20 : size === "lg" ? 30 : 24;
  const jobSize = size === "sm" ? 17 : size === "lg" ? 26 : 21;
  const primary = onLight ? colors.brandPrimary : colors.onBrandPrimary;
  const sub = onLight ? colors.muted : "#DDD6FE";
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: onLight ? colors.surfaceTertiary : "rgba(255,255,255,0.16)" }]}>
        <Broadcast size={iconSize} color={onLight ? colors.brandPrimary : "#FFFFFF"} weight="duotone" />
      </View>
      <View>
        <Text style={{ color: primary, fontSize: jobSize, fontWeight: "800", letterSpacing: -0.3 }}>
          JobRadar
        </Text>
        <Text style={{ color: sub, fontSize: size === "sm" ? 9 : 10, fontWeight: "600", letterSpacing: 0.5 }}>
          by Evolveminds
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
}));

// Simple screen header with a back button, used on stack screens.
export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
        backgroundColor: colors.surface,
      }}
    >
      <Pressable onPress={() => router.back()} hitSlop={10} testID="header-back">
        <Text style={{ color: colors.brandPrimary, fontSize: 15, fontWeight: "700" }}>‹ Back</Text>
      </Pressable>
      <Text style={{ color: colors.onSurface, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ minWidth: 52, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}
