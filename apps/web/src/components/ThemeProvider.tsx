"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("ld-theme") as Theme | null;
    const resolved = stored ?? "dark";
    setTheme(resolved);
    apply(resolved);
  }, []);

  function apply(t: Theme) {
    if (t === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  function toggle() {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("ld-theme", next);
      apply(next);
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
