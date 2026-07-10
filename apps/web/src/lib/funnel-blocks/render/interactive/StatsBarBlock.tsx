"use client";
import React, { useEffect, useRef, useState } from "react";
import type { Block } from "../../types";
import { FunnelIcon } from "../funnel-icons";

interface StatItem { value: string; label: string; icon?: string }

function parseNum(str: string) {
  const clean = str.replace(/,/g, "");
  const m = clean.match(/^([^0-9]*)(\d+\.?\d*)(.*)$/);
  if (!m || !m[2]) return null;
  const decimals = (m[2].split(".")[1] ?? "").length;
  return { prefix: m[1], n: parseFloat(m[2]), suffix: m[3], decimals, comma: str.includes(",") };
}

function fmtNum(cur: number, p: NonNullable<ReturnType<typeof parseNum>>): string {
  const n = p.decimals > 0
    ? cur.toFixed(p.decimals)
    : p.comma
      ? Math.round(cur).toLocaleString("en-US")
      : Math.round(cur).toString();
  return p.prefix + n + p.suffix;
}

function AnimatedValue({ raw, color, size, triggered }: { raw: string; color: string; size: number; triggered: boolean }) {
  const parsed = useRef(parseNum(raw));
  const [cur, setCur] = useState(0);
  const rafRef = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    parsed.current = parseNum(raw);
  }, [raw]);

  useEffect(() => {
    const p = parsed.current;
    if (!triggered || !p || done.current) return;
    done.current = true;
    let startTime: number | null = null;
    const target = p.n;
    const duration = Math.min(2000, Math.max(800, target * 1.2));
    const tick = (ts: number) => {
      if (!startTime) startTime = ts;
      const t = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCur(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [triggered]);

  const parsed0 = parsed.current;
  const display = triggered && parsed0 ? fmtNum(cur, parsed0) : raw;

  return (
    <div style={{ fontSize: size, fontWeight: 800, color, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
      {display}
    </div>
  );
}

export function StatsBarBlock({ block }: { block: Block }) {
  const p = block.props;
  const items = (p.items as StatItem[]) ?? [];
  const valColor = (p.accent_color as string) || (p.value_color as string) || "#fff";
  const lblColor = (p.label_color as string) || "#6b7280";
  const valSize  = (p.value_size as number) || 34;
  const lblSize  = (p.label_size as number) || 12;
  const uppercase = p.label_uppercase !== false;
  const showIcons = Boolean(p.show_icons);
  const dividers  = Boolean(p.dividers);
  const animate    = p.animate !== false;
  const fontFamily = (p.font_family as string) || null;

  const ref = useRef<HTMLDivElement>(null);
  const [triggered, setTriggered] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setTriggered(true); obs.disconnect(); } },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [animate]);

  return (
    <>
    {fontFamily && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, "+")}:wght@400;500;700;800&display=swap`} />}
    <div ref={ref} style={{ padding: "32px 28px", display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: dividers ? 0 : "clamp(24px, 5vw, 64px)", fontFamily: fontFamily ? `"${fontFamily}", sans-serif` : undefined }}>
      {items.map((s, i) => (
        <React.Fragment key={i}>
          {dividers && i > 0 && (
            <div style={{ width: 1, height: 52, background: "rgba(255,255,255,0.12)", flexShrink: 0, alignSelf: "center" }} />
          )}
          <div style={{ textAlign: "center", padding: dividers ? "0 clamp(18px, 4vw, 44px)" : 0 }}>
            {showIcons && s.icon && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <FunnelIcon name={s.icon} size={24} color={valColor} strokeWidth={1.8} />
              </div>
            )}
            <AnimatedValue raw={s.value || "0"} color={valColor} size={valSize} triggered={triggered} />
            <div style={{ fontSize: lblSize, color: lblColor, marginTop: 7, textTransform: uppercase ? "uppercase" : "none", letterSpacing: uppercase ? "0.07em" : 0, fontWeight: 500, lineHeight: 1.3 }}>
              {s.label}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
    </>
  );
}
