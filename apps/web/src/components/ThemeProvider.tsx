"use client";
import { createContext, useContext, useEffect } from "react";

type Theme = "dark" | "light";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The in-app shell (.v2-app design tokens) is dark-only. Light mode has no
  // shell tokens, so on any device that had a stale 'light' preference the
  // chrome renders a broken hybrid (dark backgrounds + light-mode component
  // styles) — the "weird top bar" / floating-card reports. Force dark and drop
  // any stale light preference so every device renders the intended dark UI.
  useEffect(() => {
    try { if (localStorage.getItem("ld-theme") === "light") localStorage.removeItem("ld-theme"); } catch { /* ignore */ }
    document.documentElement.classList.add("dark");
  }, []);

  return <ThemeCtx.Provider value={{ theme: "dark", toggle: () => {} }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
