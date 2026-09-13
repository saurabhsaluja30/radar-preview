// Design tokens for JobRadar by EevolveX. Purple + white premium theme.
// Keys match the "color" block of /app/design_guidelines.json.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#FFFFFF",
  onSurface: "#1F2937",
  surfaceSecondary: "#F5F3FF",
  onSurfaceSecondary: "#374151",
  surfaceTertiary: "#EDE9FE",
  onSurfaceTertiary: "#4C1D95",
  surfaceInverse: "#4C1D95",
  onSurfaceInverse: "#FFFFFF",
  muted: "#6B7280",

  // Brand — EevolveX Purple
  brand: "#6D28D9",
  onBrand: "#FFFFFF",
  brandPrimary: "#7C3AED",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#EDE9FE",
  onBrandSecondary: "#4C1D95",
  brandTertiary: "#F5F3FF",
  onBrandTertiary: "#6D28D9",

  // Status
  success: "#059669",
  onSuccess: "#FFFFFF",
  warning: "#D97706",
  onWarning: "#FFFFFF",
  error: "#DC2626",
  onError: "#FFFFFF",
  info: "#6B7280",
  onInfo: "#FFFFFF",

  // Lines
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  divider: "#F3F4F6",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
