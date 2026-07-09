"use client";
import React from "react";
import { Block, BlockLayout } from "../types";
import { Editable } from "./Editable";
import { Icon } from "./icons";
import { buildOuterStyle, buildOverlayStyle, buildInnerStyle, buildRowGridTemplate, fluid } from "./wrappers";
import { CountdownBlock } from "./interactive/CountdownBlock";
import { ChallengeSignupFormBlock } from "./interactive/ChallengeSignupFormBlock";
import { publishVideoTime } from "./interactive/videoTimeBus";
import { YouTubePlayer } from "./interactive/YouTubePlayer";
import { FunnelTracking } from "@/lib/tracking/pixels";

export type RenderMode = "edit" | "live";

export interface BlockRenderContext {
  mode: RenderMode;
  pageMaxWidth: number;
  selectedId?: string | null;
  pageId?: string;
  sessionId?: string;
  device?: string;
  tracking?: FunnelTracking | null;
  onCommitProp?: (id: string, key: string, val: string) => void;
  onCommitItem?: (id: string, idx: number, field: string | null, val: string) => void;
  onSelect?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRemove?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onQuickInsert?: (parentId: string | null, index: number) => void;
  renderChildren?: (children: Block[], parentId: string) => React.ReactNode;
}

const AC = "#f97316";

function resolveFontSize(size: unknown, fallbackRem = 2.25): string {
  if (size && typeof size === "object" && "value" in (size as Record<string, unknown>)) {
    const s = size as { value: number; unit: string };
    return `${s.value}${s.unit}`;
  }
  const legacy: Record<string, string> = { xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem", "5xl": "3rem" };
  if (typeof size === "string" && legacy[size]) return legacy[size];
  return `${fallbackRem}rem`;
}

function youtubeId(url: string): string | undefined {
  return url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)?.[1];
}

/**
 * Shared by the `video` block and embedded testimonial videos. Renders a
 * YouTube iframe for YouTube URLs, otherwise a self-hosted `<video>` tag —
 * whose currentTime is published on the video-time bus (keyed by blockId)
 * so other blocks (e.g. a CTA button) can reveal themselves once playback
 * crosses a threshold, without any shared React context.
 */
function renderEmbed(blockId: string, url: string, mode: RenderMode, placeholderSize = 60): React.ReactNode {
  const ytId = url ? youtubeId(url) : undefined;
  if (ytId) {
    return mode === "live"
      ? <YouTubePlayer blockId={blockId} ytId={ytId} />
      : (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          title="video"
          style={{ width: "100%", height: "100%", border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
  }
  if (url) {
    return (
      <video
        src={url}
        controls
        playsInline
        style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
        onTimeUpdate={mode === "live" ? e => publishVideoTime(blockId, e.currentTarget.currentTime) : undefined}
      />
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)" }}>
      <div style={{ width: placeholderSize, height: placeholderSize, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <Icon paths={["M10 9l5 3-5 3z"]} size={Math.round(placeholderSize / 3)} sw={0} />
      </div>
    </div>
  );
}

export function BlockRenderer({ block, ctx }: { block: Block; ctx: BlockRenderContext }) {
  const p = block.props;
  const editable = ctx.mode === "edit";
  const commit = (key: string) => (val: string) => ctx.onCommitProp?.(block.id, key, val);
  const focus = () => ctx.onSelect?.(block.id);
  const items = (key: string) => (Array.isArray(p[key]) ? (p[key] as Array<Record<string, string>>) : []);
  const commitItem = (idx: number, field: string | null) => (val: string) => ctx.onCommitItem?.(block.id, idx, field, val);

  switch (block.type) {
    case "row": {
      const outer = buildOuterStyle(block.layout, "0px");
      const overlay = buildOverlayStyle(block.layout);
      const inner = buildInnerStyle(block.layout, ctx.pageMaxWidth);
      const bg = (p.bg_color as string) || (outer.backgroundImage ? undefined : "transparent");
      const cols = block.children ?? [];
      const gap = block.layout?.column_gap ?? 16;
      const device = ctx.device ?? "desktop";
      const colLayouts = cols.map(c => c.layout);

      if (ctx.mode === "live") {
        // In live mode emit a <style> tag with responsive media queries so the
        // grid stacks on mobile by default (or uses any per-column overrides).
        const rowId = block.id;
        const desktopTpl = buildRowGridTemplate(colLayouts, "desktop");
        const tabletTpl  = buildRowGridTemplate(colLayouts, "tablet");
        const mobileTpl  = buildRowGridTemplate(colLayouts, "mobile");
        return (
          <div id={(p.anchor_id as string) || undefined} style={{ ...outer, background: bg, position: "relative" }}>
            {overlay && <div style={overlay} />}
            <div style={{ ...inner }}>
              <style dangerouslySetInnerHTML={{ __html:
                `.row-${rowId}{display:grid;gap:${gap}px;grid-template-columns:${desktopTpl};}` +
                `@media(max-width:640px){.row-${rowId}{grid-template-columns:${mobileTpl};}}` +
                `@media(min-width:641px) and (max-width:1023px){.row-${rowId}{grid-template-columns:${tabletTpl};}}`
              }} />
              <div className={`row-${rowId}`} style={{ position: "relative" }}>
                {ctx.renderChildren?.(cols, block.id)}
              </div>
            </div>
          </div>
        );
      }

      // Edit mode: apply grid template based on current device preview
      const gridTpl = buildRowGridTemplate(colLayouts, device);
      return (
        <div id={(p.anchor_id as string) || undefined} style={{ ...outer, background: bg, position: "relative" }}>
          {overlay && <div style={overlay} />}
          <div style={{ ...inner }}>
            <div style={{ display: "grid", gridTemplateColumns: gridTpl, gap, position: "relative" }}>
              {ctx.renderChildren?.(cols, block.id)}
            </div>
          </div>
        </div>
      );
    }

    case "column": {
      const outer = buildOuterStyle(block.layout, "0px");
      const bg = (p.bg_color as string) || (outer.backgroundImage ? undefined : "transparent");
      return (
        <div id={(p.anchor_id as string) || undefined} style={{ ...outer, background: bg, minHeight: 0 }}>
          {ctx.renderChildren?.(block.children ?? [], block.id)}
        </div>
      );
    }

    case "section": {
      const outer = buildOuterStyle(block.layout, "40px 28px");
      const overlay = buildOverlayStyle(block.layout);
      const inner = buildInnerStyle(block.layout, ctx.pageMaxWidth);
      const bg = (p.bg_color as string) || (outer.backgroundImage ? undefined : "transparent");
      return (
        <div id={(p.anchor_id as string) || undefined} style={{ ...outer, background: bg, position: "relative" }}>
          {overlay && <div style={overlay} />}
          <div style={inner}>{ctx.renderChildren?.(block.children ?? [], block.id)}</div>
        </div>
      );
    }

    case "spacer": {
      const h = (p.height as number) ?? 40;
      return (
        <div style={{ height: h, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {editable && (
            <span style={{ fontSize: 10.5, color: "#3a4252", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 5, padding: "1px 7px" }}>
              Spacer · {h}px
            </span>
          )}
        </div>
      );
    }

    case "divider":
      return (
        <div style={{ padding: "18px 28px" }}>
          <div style={{ height: 1, background: (p.color as string) || "rgba(255,255,255,0.1)" }} />
        </div>
      );

    case "headline": {
      const size = resolveFontSize(p.size, 2.25);
      return (
        <div style={{ padding: "10px 28px" }}>
          <Editable
            tag="h2"
            value={(p.text as string) || "Headline"}
            editable={editable}
            onCommit={commit("text")}
            onFocus={focus}
            style={{
              fontSize: size, fontWeight: (p.weight as string) || "bold", color: (p.color as string) || "#fff",
              textAlign: (p.align as React.CSSProperties["textAlign"]) || "left", lineHeight: 1.2, margin: 0,
            }}
          />
        </div>
      );
    }

    case "body-text":
      return (
        <div style={{ padding: "8px 28px" }}>
          <Editable
            tag="p"
            value={(p.text as string) || "Paragraph text…"}
            editable={editable}
            onCommit={commit("text")}
            onFocus={focus}
            style={{
              fontSize: (p.size as string) || "1rem", color: (p.color as string) || "#c7ccd4",
              textAlign: (p.align as React.CSSProperties["textAlign"]) || "left", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap",
            }}
          />
        </div>
      );

    case "list": {
      const li = items("items");
      return (
        <div style={{ padding: "8px 28px" }}>
          {li.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 9 }}>
              <span style={{ flexShrink: 0, marginTop: 3, color: (p.accent_color as string) || AC }}>
                <Icon paths={["M20 6L9 17l-5-5"]} size={15} sw={2.6} />
              </span>
              <Editable
                tag="span"
                value={it.text || ""}
                editable={editable}
                onCommit={commitItem(i, "text")}
                onFocus={focus}
                style={{ color: "#d7dbe2", fontSize: 15, lineHeight: 1.5 }}
              />
            </div>
          ))}
        </div>
      );
    }

    case "image": {
      const src = p.src as string | undefined;
      const img = src ? (
        <img src={src} alt={(p.alt as string) || ""} style={{ width: "100%", display: "block", borderRadius: (p.radius as number) ?? 0 }} />
      ) : editable ? (
        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 8, color: "#3a4252" }}>
          <Icon paths={["M3 5h18v14H3z", "M3 16l5-5 4 4 3-3 6 6"]} size={28} sw={1.4} />
        </div>
      ) : null;
      return (
        <div style={{ padding: "10px 28px" }} onClick={editable ? focus : undefined}>
          {!editable && p.href ? <a href={p.href as string}>{img}</a> : img}
        </div>
      );
    }

    case "video": {
      const url = (p.url as string) || "";
      const sizeMap: Record<string, number | string> = { s: 480, m: 680, l: 860, xl: "100%" };
      const sizeProp = (p.size as string) || "m";
      const maxW = sizeMap[sizeProp] ?? 680;
      return (
        <div style={{ padding: "10px 28px" }}>
          <div style={{ maxWidth: maxW === "100%" ? "100%" : maxW, margin: "0 auto", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#000", position: "relative" }}>
            {renderEmbed(block.id, url, ctx.mode)}
          </div>
        </div>
      );
    }

    case "hero": {
      const heroAc = (p.accent_color as string) || AC;
      const heroColor = (p.color as string) || "#fff";
      const btn1Style: React.CSSProperties = { display: "inline-flex", background: heroAc, color: (p.button_color as string) || "#fff", fontWeight: 700, fontSize: 16, padding: "15px 36px", borderRadius: 11, boxShadow: `0 14px 30px -10px ${heroAc}99`, textDecoration: "none" };
      const btn2Style: React.CSSProperties = { display: "inline-flex", background: (p.button2_bg as string) || "#f3f4f6", color: (p.button2_color as string) || "#374151", fontWeight: 600, fontSize: 16, padding: "15px 36px", borderRadius: 11, textDecoration: "none" };
      return (
        <div id={(p.anchor_id as string) || undefined} style={{ padding: `${fluid(48, 96)} ${fluid(20, 28)}`, textAlign: (p.align as React.CSSProperties["textAlign"]) || "center", background: (p.bg_color as string) || "transparent" }}>
          {Boolean(p.eyebrow) && (
            <Editable tag="div" value={p.eyebrow as string} editable={editable} onCommit={commit("eyebrow")} onFocus={focus}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${heroAc}18`, border: `1px solid ${heroAc}44`, borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, color: heroAc, marginBottom: 24 }} />
          )}
          <Editable tag="h1" value={(p.headline as string) || "Your big promise headline"} editable={editable} onCommit={commit("headline")} onFocus={focus}
            style={{ fontSize: fluid(32, 56), fontWeight: 800, color: heroColor, lineHeight: 1.1, margin: "0 auto", maxWidth: 780 }} />
          <Editable tag="p" value={(p.subtext as string) || "Supporting subtext that explains the offer."} editable={editable} onCommit={commit("subtext")} onFocus={focus}
            style={{ fontSize: fluid(15, 19), color: (p.subtext_color as string) || "#aeb6c2", marginTop: 18, maxWidth: 620, margin: "18px auto 0" }} />
          {(Boolean(p.button_text) || Boolean(p.button2_text)) && (
            <div style={{ marginTop: 30, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              {Boolean(p.button_text) && (editable
                ? <span style={btn1Style}>{p.button_text as string}</span>
                : <a href={(p.button_url as string) || "#"} style={btn1Style}>{p.button_text as string}</a>
              )}
              {Boolean(p.button2_text) && (editable
                ? <span style={btn2Style}>{p.button2_text as string}</span>
                : <a href={(p.button2_url as string) || "#"} style={btn2Style}>{p.button2_text as string}</a>
              )}
            </div>
          )}
        </div>
      );
    }

    case "countdown-timer":
      return ctx.mode === "live" ? (
        <CountdownBlock block={block} />
      ) : (
        <div style={{ background: (p.bg_color as string) || "transparent", padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span style={{ color: "#aeb6c2", fontSize: 13, fontWeight: 500 }}>{(p.label as string) || "Enrollment closes in"}</span>
          <div style={{ display: "flex", gap: 7 }}>
            {["Days", "Hrs", "Min", "Sec"].map(l => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ background: (p.accent_color as string) || AC, color: "#fff", fontWeight: 700, fontSize: 17, borderRadius: 7, padding: "5px 9px", minWidth: 42 }}>00</div>
                <div style={{ color: "#6b7280", fontSize: 8.5, marginTop: 3, textTransform: "uppercase", letterSpacing: ".08em" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case "testimonial": {
      const cardBg     = (p.card_bg     as string) || "rgba(255,255,255,0.03)";
      const cardBorder = (p.card_border as string) || "rgba(255,255,255,0.07)";
      const quoteColor = (p.quote_color as string) || "#e7ecf3";
      const nameColor  = (p.name_color  as string) || "#fff";
      const roleColor  = (p.role_color  as string) || "#7e8794";
      const resultColor = (p.result_color as string) || AC;
      const initials   = (p.initials    as string) || "";
      const result     = (p.result      as string) || "";
      const avatarBg   = (p.avatar_bg   as string) || `linear-gradient(135deg,${AC},#dc2626)`;
      return (
        <div style={{ padding: "24px 28px", maxWidth: 620, margin: "0 auto" }}>
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 16, padding: "26px 24px" }}>
            {Boolean(p.video_url) && (
              <div style={{ aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "#000", marginBottom: 18, position: "relative" }}>
                {renderEmbed(block.id, p.video_url as string, ctx.mode, 46)}
              </div>
            )}
            <Editable tag="p" value={(p.quote as string) || "This changed everything for me."} editable={editable} onCommit={commit("quote")} onFocus={focus}
              style={{ fontSize: fluid(15, 17), color: quoteColor, lineHeight: 1.6, fontStyle: "italic", margin: 0 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
              {p.avatar
                ? <img src={p.avatar as string} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                : initials
                  ? <div style={{ width: 38, height: 38, borderRadius: "50%", background: avatarBg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                  : null
              }
              <div>
                <Editable tag="div" value={(p.name as string) || "Jane Doe"} editable={editable} onCommit={commit("name")} onFocus={focus} style={{ fontWeight: 700, fontSize: 13.5, color: nameColor }} />
                {result
                  ? <div style={{ fontSize: 12, color: resultColor, fontWeight: 600 }}>{result}</div>
                  : <Editable tag="div" value={(p.role as string) || ""} editable={editable} onCommit={commit("role")} onFocus={focus} style={{ fontSize: 12, color: roleColor }} />
                }
              </div>
            </div>
          </div>
        </div>
      );
    }

    case "pricing-card": {
      const feats = items("features");
      return (
        <div style={{ padding: "24px 28px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 360, background: "rgba(255,255,255,0.03)", border: `1px solid ${(p.accent_color as string) || AC}55`, borderRadius: 18, padding: "28px 26px", boxShadow: `0 20px 50px -24px ${(p.accent_color as string) || AC}55` }}>
            <Editable tag="div" value={(p.title as string) || "Plan name"} editable={editable} onCommit={commit("title")} onFocus={focus} style={{ fontSize: 13, fontWeight: 700, color: (p.accent_color as string) || AC, textTransform: "uppercase", letterSpacing: ".06em" }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
              <Editable tag="span" value={(p.price as string) || "$97"} editable={editable} onCommit={commit("price")} onFocus={focus} style={{ fontSize: 38, fontWeight: 800, color: "#fff" }} />
              <Editable tag="span" value={(p.period as string) || "one-time"} editable={editable} onCommit={commit("period")} onFocus={focus} style={{ fontSize: 13, color: "#7e8794" }} />
            </div>
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 9 }}>
              {feats.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ color: (p.accent_color as string) || AC, marginTop: 2 }}><Icon paths={["M20 6L9 17l-5-5"]} size={14} sw={2.6} /></span>
                  <Editable tag="span" value={f.text || ""} editable={editable} onCommit={commitItem(i, "text")} onFocus={focus} style={{ fontSize: 13.5, color: "#d7dbe2" }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 22 }}>
              {(() => {
                const btnStyle: React.CSSProperties = { display: "block", textAlign: "center", background: (p.accent_color as string) || AC, color: "#fff", fontWeight: 700, fontSize: 14.5, padding: "13px", borderRadius: 10, textDecoration: "none" };
                const label = (p.button_text as string) || "Get started";
                return editable ? (
                  <span style={btnStyle}>{label}</span>
                ) : (
                  <a href={(p.button_url as string) || "#"} style={btnStyle}>{label}</a>
                );
              })()}
            </div>
          </div>
        </div>
      );
    }

    case "faq-accordion": {
      const qs        = items("items");
      const itemBg    = (p.item_bg     as string) || "rgba(255,255,255,0.03)";
      const itemBord  = (p.item_border as string) || "rgba(255,255,255,0.07)";
      const qColor    = (p.q_color     as string) || "#fff";
      const aColor    = (p.a_color     as string) || "#9aa3b0";
      const showNum   = Boolean(p.show_number);
      const numBg     = (p.accent_color as string) || AC;
      return (
        <div style={{ padding: "16px 28px", display: "flex", flexDirection: "column", gap: 10, maxWidth: 700, margin: "0 auto" }}>
          {qs.map((q, i) =>
            editable ? (
              <div key={i} style={{ background: itemBg, border: `1px solid ${itemBord}`, borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {showNum && (
                    <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: numBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                  )}
                  <Editable tag="div" value={q.q || ""} editable onCommit={commitItem(i, "q")} onFocus={focus} style={{ fontWeight: 700, fontSize: 14.5, color: qColor, flex: 1 }} />
                </div>
                <div style={{ paddingLeft: showNum ? 44 : 0, marginTop: 6 }}>
                  <Editable tag="div" value={q.a || ""} editable onCommit={commitItem(i, "a")} onFocus={focus} style={{ fontSize: 13.5, color: aColor, lineHeight: 1.55 }} />
                </div>
              </div>
            ) : (
              <details key={i} style={{ background: itemBg, border: `1px solid ${itemBord}`, borderRadius: 12, overflow: "hidden" }}>
                <summary style={{ display: "flex", alignItems: "center", gap: 12, fontWeight: 700, fontSize: 14.5, color: qColor, cursor: "pointer", listStyle: "none", padding: "14px 16px" }}>
                  {showNum && (
                    <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: numBg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                  )}
                  <span style={{ flex: 1 }}>{q.q}</span>
                  <span style={{ fontSize: 18, color: aColor, flexShrink: 0 }}>+</span>
                </summary>
                <p style={{ fontSize: 13.5, color: aColor, margin: 0, padding: showNum ? "0 16px 14px 60px" : "0 16px 14px", lineHeight: 1.6 }}>{q.a}</p>
              </details>
            )
          )}
        </div>
      );
    }

    case "stats-bar": {
      const stats = items("items");
      const valColor = (p.value_color as string) || "#fff";
      const lblColor = (p.label_color as string) || "#7e8794";
      return (
        <div style={{ padding: "26px 28px", display: "flex", justifyContent: "center", gap: fluid(22, 64), flexWrap: "wrap" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <Editable tag="div" value={s.value || ""} editable={editable} onCommit={commitItem(i, "value")} onFocus={focus} style={{ fontSize: fluid(24, 34), fontWeight: 800, color: valColor }} />
              <Editable tag="div" value={s.label || ""} editable={editable} onCommit={commitItem(i, "label")} onFocus={focus} style={{ fontSize: 12, color: lblColor, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }} />
            </div>
          ))}
        </div>
      );
    }

    case "cta-button": {
      const ac = (p.accent_color as string) || AC;
      const size = p.size as "sm" | "md" | "lg" | undefined;
      const pad = size === "lg" ? "18px 44px" : size === "sm" ? "10px 22px" : "15px 34px";
      const fs = size === "lg" ? 18 : size === "sm" ? 13.5 : 16;
      const btnStyle: React.CSSProperties = {
        display: p.full_width ? "flex" : "inline-flex", justifyContent: "center", background: ac, color: (p.text_color as string) || "#fff",
        fontWeight: 700, fontSize: fs, padding: pad, borderRadius: 11, boxShadow: `0 12px 28px -8px ${ac}88`, textDecoration: "none", width: p.full_width ? "100%" : undefined,
      };
      return (
        <div style={{ background: (p.bg_color as string) || "transparent", padding: "24px 28px", textAlign: "center" }}>
          {editable ? (
            <Editable tag="span" value={(p.text as string) || "Click here"} editable onCommit={commit("text")} onFocus={focus} style={btnStyle} />
          ) : (
            <a href={(p.url as string) || "#"} style={btnStyle}>{(p.text as string) || "Click here"}</a>
          )}
        </div>
      );
    }

    case "optin-form":
      return ctx.mode === "live" ? (
        <ChallengeSignupFormBlock block={block} />
      ) : (
        // Editor preview — static mockup of the challenge form
        <div style={{ background: (p.bg_color as string) || "#f9fafb", padding: `${fluid(40, 50)} ${fluid(22, 32)}` }}>
          <div style={{ maxWidth: 480, margin: "0 auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "32px 28px", boxShadow: "0 12px 40px -12px rgba(0,0,0,.1)" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{(p.heading as string) || "Join the 7-Day Challenge"}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{(p.subtext as string) || "₦10,000 one-time"}</div>
            </div>
            {["Full Name","Email Address","WhatsApp Number","Password"].map(f => (
              <div key={f} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 12px", color: "#9ca3af", fontSize: 13, background: "#f9fafb", marginBottom: 8 }}>{f}</div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "12px 0" }}>
              <div style={{ border: `2px solid ${(p.accent_color as string) || AC}`, borderRadius: 8, padding: 9, fontSize: 12, color: "#c2410c", background: "#fff7ed", textAlign: "center" }}>🏦 Bank Transfer</div>
              <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 9, fontSize: 12, color: "#6b7280", background: "#f9fafb", textAlign: "center" }}>💳 Pay Online</div>
            </div>
            <div style={{ background: (p.accent_color as string) || AC, color: "#fff", fontWeight: 700, fontSize: 14, padding: 12, borderRadius: 10, textAlign: "center" }}>
              I&apos;ve Paid — Register Me →
            </div>
          </div>
        </div>
      );

    case "custom-html":
      return editable ? (
        <div style={{ padding: "8px 28px" }}>
          <div style={{ border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 8, padding: "12px 14px", color: "#7e8794", fontSize: 12, fontFamily: "monospace" }} onClick={focus}>
            {(p.html as string)?.slice(0, 140) || "<!-- custom html -->"}
          </div>
        </div>
      ) : (
        <div style={{ padding: "8px 28px" }} dangerouslySetInnerHTML={{ __html: (p.html as string) || "" }} />
      );

    case "info-card": {
      const ICON_PATHS: Record<string, string[]> = {
        check:   ["M20 6L9 17l-5-5"],
        star:    ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
        bolt:    ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
        shield:  ["M12 2l7 4v6c0 5.25-7 10-7 10S5 17.25 5 12V6l7-4z"],
        chart:   ["M5 20V11","M12 20V4","M19 20v-7"],
        globe:   ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z","M2 12h20","M12 2c-2.76 3.63-4 7-4 10s1.24 6.37 4 10c2.76-3.63 4-7 4-10S14.76 2 12 2z"],
        users:   ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2","M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z","M23 21v-2a4 4 0 0 0-3-3.87","M16 3.13a4 4 0 0 1 0 7.75"],
        diamond: ["M12 2l8 9-8 11-8-11L12 2z","M3 11h18"],
        zap:     ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
        clock:   ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z","M12 8v4l3 2"],
        heart:   ["M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"],
        target:  ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z","M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z","M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"],
      };
      const iconType  = (p.icon_type   as string) || "check";
      const iconColor = (p.icon_color  as string) || AC;
      const titleColor= (p.title_color as string) || "#ffffff";
      const bodyColor = (p.body_color  as string) || "#9aa4b2";
      const cardBg    = (p.card_bg     as string) || "rgba(255,255,255,0.03)";
      const cardBd    = (p.card_border as string) || "rgba(255,255,255,0.07)";
      const radius    = (p.radius      as number) ?? 12;
      const align     = ((p.align as string) || "left") as React.CSSProperties["textAlign"];
      const showIcon  = p.show_icon !== false;
      const paths     = ICON_PATHS[iconType] ?? ICON_PATHS.check;
      return (
        <div style={{ padding: "8px 16px" }}>
          <div style={{ background: cardBg, border: `1px solid ${cardBd}`, borderRadius: radius, padding: "24px", textAlign: align }}>
            {showIcon && (
              <div style={{ display: "flex", justifyContent: align === "center" ? "center" : "flex-start", marginBottom: 14 }}>
                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 10, background: `${iconColor}18`, border: `1px solid ${iconColor}33`, color: iconColor }}>
                  <Icon paths={paths} size={22} sw={1.8} />
                </div>
              </div>
            )}
            <Editable tag="h3" value={(p.title as string) || "Key benefit"} editable={editable} onCommit={commit("title")} onFocus={focus}
              style={{ fontSize: 16, fontWeight: 700, color: titleColor, lineHeight: 1.3, margin: "0 0 8px" }} />
            <Editable tag="p" value={(p.body as string) || "Describe this benefit in one or two sentences."} editable={editable} onCommit={commit("body")} onFocus={focus}
              style={{ fontSize: 14, color: bodyColor, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }} />
            {Boolean(p.link_text) && (
              <div style={{ marginTop: 14 }}>
                {editable
                  ? <span style={{ fontSize: 13, fontWeight: 600, color: iconColor }}>{p.link_text as string} →</span>
                  : <a href={(p.link_url as string) || "#"} style={{ fontSize: 13, fontWeight: 600, color: iconColor, textDecoration: "none" }}>{p.link_text as string} →</a>
                }
              </div>
            )}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

export type { BlockLayout };
