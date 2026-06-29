"use client";
import { useEffect, useRef, useState } from "react";
import { Block } from "@/lib/funnel-blocks/types";
import { normalizeLegacyBlocks } from "@/lib/funnel-blocks/tree";
import { BlockTree } from "@/lib/funnel-blocks/render/BlockTree";

interface Props {
  funnelId:     string;
  funnelSlug:   string;
  pageId:       string;
  pageSlug:     string;
  pageName:     string;
  blocks:       Block[];
  settings:     Record<string, unknown>;
  connection:   Record<string, unknown>;
  globalStyles: Record<string, unknown>;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const key = "ld_fsid";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getUtmParams() {
  if (typeof window === "undefined") return {};
  const sp = new URLSearchParams(window.location.search);
  return {
    utm_source:   sp.get("utm_source") ?? undefined,
    utm_medium:   sp.get("utm_medium") ?? undefined,
    utm_campaign: sp.get("utm_campaign") ?? undefined,
    utm_content:  sp.get("utm_content") ?? undefined,
    utm_term:     sp.get("utm_term") ?? undefined,
    referrer:     document.referrer || undefined,
    device:       /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
  };
}

export default function FunnelPageRenderer({
  funnelId,
  pageId,
  blocks,
  settings,
  globalStyles,
}: Props) {
  const trackedRef = useRef(false);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    const sid = getSessionId();
    setSessionId(sid);

    if (trackedRef.current) return;
    trackedRef.current = true;

    const utm = getUtmParams();
    fetch("/api/funnels/track", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "session", funnel_id: funnelId, session_id: sid, ...utm }),
    }).catch(() => {});

    fetch("/api/funnels/track", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "event", session_id: sid, page_id: pageId, event_type: "view" }),
    }).catch(() => {});
  }, [funnelId, pageId]);

  const bgColor = (settings.bg_color as string) ?? (globalStyles.bg_color as string) ?? "#0c0c0f";
  const layout = (settings.layout as { width_mode?: "boxed" | "full"; max_width?: number }) ?? {};
  const pageMaxWidth = layout.max_width ?? 1100;
  const tree = normalizeLegacyBlocks(blocks);

  return (
    <div style={{ backgroundColor: bgColor, minHeight: "100vh", fontFamily: (globalStyles.font as string) ?? "Inter, sans-serif" }}>
      <BlockTree blocks={tree} ctx={{ mode: "live", pageMaxWidth, pageId, sessionId }} />
    </div>
  );
}
