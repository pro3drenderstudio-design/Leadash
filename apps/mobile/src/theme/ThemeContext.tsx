/**
 * Theme provider — dark / light / follow-system, persisted on device.
 * useTheme() hands components the active palette plus the status-tone maps.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DARK, LIGHT, Palette, StatusTone,
  crmStatusMap, campaignStatusMap, inboxStatusMap,
} from "./tokens";

export type ThemeMode = "system" | "dark" | "light";

const MODE_KEY = "ld_theme_mode";

interface ThemeValue {
  C:               Palette;
  isDark:          boolean;
  mode:            ThemeMode;
  setMode:         (m: ThemeMode) => void;
  CRM_STATUS:      Record<string, StatusTone>;
  CAMPAIGN_STATUS: Record<string, { color: string; soft: string }>;
  INBOX_STATUS:    Record<string, { color: string; soft: string }>;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then(v => {
        if (v === "light" || v === "dark" || v === "system") setModeState(v);
      })
      .finally(() => setLoaded(true));
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  }

  const isDark = mode === "system" ? systemScheme !== "light" : mode === "dark";
  const C = isDark ? DARK : LIGHT;

  const value = useMemo<ThemeValue>(() => ({
    C,
    isDark,
    mode,
    setMode,
    CRM_STATUS:      crmStatusMap(C),
    CAMPAIGN_STATUS: campaignStatusMap(C),
    INBOX_STATUS:    inboxStatusMap(C),
  }), [C, isDark, mode]);

  if (!loaded) return null; // avoid a light/dark flash before the stored mode loads

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
