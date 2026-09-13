import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import { makeStyles, useTheme } from "@/src/theme";

// -------------------------- Button --------------------------
type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  testID,
  fullWidth = true,
  style,
  icon,
}: BtnProps) {
  const styles = useBtnStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const pad = size === "sm" ? 10 : size === "lg" ? 17 : 14;
  const font = size === "sm" ? 14 : size === "lg" ? 17 : 15;

  const bg =
    variant === "primary"
      ? colors.brandPrimary
      : variant === "secondary"
        ? colors.brandSecondary
        : variant === "danger"
          ? colors.error
          : "transparent";
  const fg =
    variant === "primary"
      ? colors.onBrandPrimary
      : variant === "danger"
        ? colors.onError
        : variant === "secondary"
          ? colors.onBrandSecondary
          : colors.brandPrimary;
  const border =
    variant === "outline" ? colors.borderStrong : variant === "ghost" ? "transparent" : bg;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          paddingVertical: pad,
          opacity: isDisabled ? 0.55 : pressed ? 0.88 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          paddingHorizontal: fullWidth ? 20 : 22,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text style={[styles.txt, { color: fg, fontSize: font }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const useBtnStyles = makeStyles(() => ({
  base: {
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  txt: { fontWeight: "700", letterSpacing: 0.2 },
}));

// -------------------------- Card --------------------------
export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const styles = useCardStyles();
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const useCardStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
}));

// -------------------------- Badge --------------------------
export function Badge({
  label,
  color = "info",
  testID,
}: {
  label: string;
  color?: "success" | "warning" | "error" | "info" | "brand";
  testID?: string;
}) {
  const { colors } = useTheme();
  const map = {
    success: { bg: "#DCFCE7", fg: colors.success },
    warning: { bg: "#FEF3C7", fg: colors.warning },
    error: { bg: "#FEE2E2", fg: colors.error },
    info: { bg: colors.surfaceTertiary, fg: colors.muted },
    brand: { bg: colors.surfaceTertiary, fg: colors.brandPrimary },
  }[color];
  return (
    <View
      testID={testID}
      style={{
        backgroundColor: map.bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: map.fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

// -------------------------- Input --------------------------
type InputProps = TextInputProps & { label?: string; testID?: string; hint?: string };

export function Input({ label, hint, style, testID, ...props }: InputProps) {
  const styles = useInputStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useInputStyles = makeStyles((colors) => ({
  label: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.onSurface,
  },
  hint: { color: colors.muted, fontSize: 12 },
}));

// -------------------------- Chip --------------------------
export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={{
        height: 36,
        flexShrink: 0,
        paddingHorizontal: 16,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? colors.brandPrimary : colors.surfaceTertiary,
        borderWidth: 1,
        borderColor: selected ? colors.brandPrimary : colors.border,
      }}
    >
      <Text
        style={{
          color: selected ? colors.onBrandPrimary : colors.onSurfaceTertiary,
          fontWeight: "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// -------------------------- Section Title --------------------------
export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <Text style={{ color: colors.onSurface, fontSize: 18, fontWeight: "800" }}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// -------------------------- Empty State --------------------------
export function EmptyState({
  title,
  subtitle,
  testID,
}: {
  title: string;
  subtitle?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 24 }} testID={testID}>
      <Text style={{ fontSize: 40, marginBottom: 8 }}>🔎</Text>
      <Text style={{ color: colors.onSurface, fontSize: 16, fontWeight: "800", textAlign: "center" }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 6 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
