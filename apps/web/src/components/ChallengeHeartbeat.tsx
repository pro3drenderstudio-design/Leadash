"use client";
import { useEffect } from "react";
import { wsPost } from "@/lib/workspace/client";

/**
 * Fires a lightweight heartbeat every 5 minutes while a tab is visible. The
 * server no-ops unless the user is in a live challenge cohort, so this is cheap
 * for everyone else. Drives the "time using Leadash" + daily-login points.
 */
const INTERVAL_MS = 5 * 60 * 1000;

export default function ChallengeHeartbeat() {
  useEffect(() => {
    let stopped = false;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      wsPost("/api/academy/challenge/heartbeat", {}).catch(() => {});
    };
    ping();
    const id = setInterval(() => { if (!stopped) ping(); }, INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return null;
}
