/**
 * Shared UI primitives — Card, Chip, Btn, Skeleton, EmptyState, ErrorState.
 * Styled from the design tokens; mirrors the prototype's card/chip treatment.
 */
import React from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";

export function Card({ children, style, onPress }: {
  children: React.ReactNode; style?: ViewStyle; onPress?: () => void;
}) {
  const { C } = useTheme();
  const base: ViewStyle = {
    backgroundColor: C.elevated,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    padding: 14,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: C.surfaceStrong }}
        style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function Chip({ label, color, soft }: { label: string; color: string; soft: string }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, backgroundColor: soft, alignSelf: "flex-start" }}>
      <Text style={{ fontSize: 10.5, lineHeight: 14, fontFamily: FONT.bold, color, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
    </View>
  );
}

export function Btn({ label, onPress, disabled, loading, variant = "primary", style }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  variant?: "primary" | "secondary" | "ghost"; style?: ViewStyle;
}) {
  const { C } = useTheme();
  const bg = variant === "primary" ? C.accent : variant === "secondary" ? C.surfaceStrong : "transparent";
  const fg = variant === "primary" ? "#fff" : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: R.md,
          paddingVertical: 12,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={fg} />
        : <Text style={{ color: fg, fontSize: 14, fontFamily: FONT.semibold }}>{label}</Text>}
    </Pressable>
  );
}

export function Skeleton({ height = 64, style }: { height?: number; style?: ViewStyle }) {
  const { C } = useTheme();
  return (
    <View style={[{ height, borderRadius: R.md, backgroundColor: C.surface, opacity: 0.7 }, style]} />
  );
}

export function SectionLabel({ children, style }: { children: string; style?: TextStyle }) {
  const { C } = useTheme();
  return (
    <Text style={[{
      fontSize: 11, fontFamily: FONT.bold, letterSpacing: 0.8,
      textTransform: "uppercase", color: C.textQuiet, marginBottom: 8,
    }, style]}>
      {children}
    </Text>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const { C } = useTheme();
  return (
    <View style={styles.centerBox}>
      <Text style={{ fontSize: 14, fontFamily: FONT.semibold, color: C.textMuted, textAlign: "center" }}>{title}</Text>
      {hint ? <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: C.textQuiet, textAlign: "center", marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { C } = useTheme();
  return (
    <View style={styles.centerBox}>
      <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: C.danger, textAlign: "center" }}>{message}</Text>
      {onRetry ? <Btn label="Retry" variant="secondary" onPress={onRetry} style={{ marginTop: 12, alignSelf: "center", paddingHorizontal: 24 }} /> : null}
    </View>
  );
}

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const { C } = useTheme();
  const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={{
      width: size, height: size, borderRadius: R.pill, backgroundColor: color ?? C.accent,
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ fontSize: Math.round(size * 0.36), fontFamily: FONT.bold, color: C.bg }}>{initials}</Text>
    </View>
  );
}

export function ProgressBar({ pct, color, height = 6 }: { pct: number; color?: string; height?: number }) {
  const { C } = useTheme();
  return (
    <View style={{ height, backgroundColor: C.surfaceStrong, borderRadius: R.pill, overflow: "hidden" }}>
      <View style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color ?? C.accent, borderRadius: R.pill }} />
    </View>
  );
}

const styles = StyleSheet.create({
  centerBox: { paddingVertical: 48, paddingHorizontal: 32, alignItems: "center", justifyContent: "center" },
});
