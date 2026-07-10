"use client";
import React from "react";
import { Block, BlockLayout } from "../types";
import { Editable } from "./Editable";
import { buildOuterStyle, buildOverlayStyle, buildPatternStyle, buildInnerStyle, buildRowGridTemplate, buildResponsiveSpacingCss, hasResponsiveLayout, fluid } from "./wrappers";
import { FunnelIcon, FUNNEL_ICON_LIST } from "./funnel-icons";
import { CountdownBlock } from "./interactive/CountdownBlock";
import { ChallengeSignupFormBlock } from "./interactive/ChallengeSignupFormBlock";
import { StatsBarBlock } from "./interactive/StatsBarBlock";
import { publishVideoTime } from "./interactive/videoTimeBus";
import { YouTubePlayer } from "./interactive/YouTubePlayer";
import { HLSPlayer } from "./interactive/HLSPlayer";
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
  renderChildren?: (children: Block[], parentId: string, parentType?: string) => React.ReactNode;
}

const AC = "#f97316";

/** @deprecated use FUNNEL_ICON_LIST */
export const ICON_TYPE_LIST = FUNNEL_ICON_LIST;

function fontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap`;
}

function FontLink({ family }: { family?: string | null }) {
  if (!family) return null;
  return <link rel="stylesheet" href={fontHref(family)} />;
}

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
function renderEmbed(blockId: string, url: string, mode: RenderMode, placeholderSize = 60, poster?: string): React.ReactNode {
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
  if (url && url.includes(".m3u8")) {
    return mode === "live"
      ? <HLSPlayer blockId={blockId} src={url} poster={poster} />
      : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#fff", fontSize: 13, gap: 8, flexDirection: "column" }}>
          <FunnelIcon name="play" size={32} strokeWidth={0} />
          <span style={{ opacity: 0.6 }}>HLS video (live preview only)</span>
        </div>
      );
  }
  if (url) {
    return (
      <video
        src={url}
        controls
        playsInline
        preload="none"
        poster={poster || undefined}
        style={{ width: "100%", height: "100%", display: "block", background: "#000" }}
        onTimeUpdate={mode === "live" ? e => publishVideoTime(blockId, e.currentTarget.currentTime) : undefined}
      />
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)" }}>
      <div style={{ width: placeholderSize, height: placeholderSize, borderRadius: "50%", background: AC, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <FunnelIcon name="play" size={Math.round(placeholderSize / 3)} strokeWidth={0} />
      </div>
    </div>
  );
}

export function BlockRenderer({ block, ctx }: { block: Block; ctx: BlockRenderContext }) {
  // Per-device prop overrides: merge mobile/tablet overrides into props for canvas preview.
  // In live mode these become CSS custom properties (emitted by LiveBlockRow via buildPropResponsiveCss).
  const mP = (block.layout?.props_mobile ?? {}) as Record<string, unknown>;
  const tP = (block.layout?.props_tablet ?? {}) as Record<string, unknown>;
  const pOverride = ctx.device === "mobile" ? mP : ctx.device === "tablet" ? tP : {};
  const p = Object.keys(pOverride).length ? { ...block.props, ...pOverride } : block.props;
  const bid = block.id;
  const editable = ctx.mode === "edit";
  const isLive = ctx.mode === "live";
  // Returns true when, in live mode, a responsive prop override exists for any of the given keys.
  // Used to decide whether to use CSS variable syntax in inline styles.
  function hasResp(...keys: string[]): boolean {
    if (!isLive) return false;
    return keys.some(k => k in mP || k in tP);
  }
  const commit = (key: string) => (val: string) => ctx.onCommitProp?.(block.id, key, val);
  const focus = () => ctx.onSelect?.(block.id);
  const items = (key: string) => (Array.isArray(p[key]) ? (p[key] as Array<Record<string, string>>) : []);
  const commitItem = (idx: number, field: string | null) => (val: string) => ctx.onCommitItem?.(block.id, idx, field, val);

  switch (block.type) {
    case "row": {
      const device = ctx.device ?? "desktop";
      const outer = buildOuterStyle(block.layout, "0px", device);
      const overlay = buildOverlayStyle(block.layout);
      const pattern = buildPatternStyle(block.layout);
      const inner = buildInnerStyle(block.layout, ctx.pageMaxWidth);
      const hasLayerBg = outer.background || outer.backgroundImage;
      const bg = hasLayerBg ? undefined : ((p.bg_color as string) || "transparent");
      const cols = block.children ?? [];
      const gap = block.layout?.column_gap ?? 16;
      const colLayouts = cols.map(c => c.layout);

      if (ctx.mode === "live") {
        const desktopTpl = buildRowGridTemplate(colLayouts, "desktop");
        const tabletTpl  = buildRowGridTemplate(colLayouts, "tablet");
        const mobileTpl  = buildRowGridTemplate(colLayouts, "mobile");
        const respCss = buildResponsiveSpacingCss(bid, block.layout);
        return (
          <div id={(p.anchor_id as string) || undefined} data-blk={respCss ? bid : undefined} style={{ ...outer, ...(bg !== undefined ? { background: bg } : {}), position: "relative" }}>
            {pattern && <div style={pattern} />}
            {overlay && <div style={overlay} />}
            <div style={{ ...inner }}>
              <style dangerouslySetInnerHTML={{ __html:
                `.row-${bid}{display:grid;gap:${gap}px;grid-template-columns:${desktopTpl};}` +
                `@media(max-width:640px){.row-${bid}{grid-template-columns:${mobileTpl};}}` +
                `@media(min-width:641px) and (max-width:1023px){.row-${bid}{grid-template-columns:${tabletTpl};}}` +
                respCss
              }} />
              <div className={`row-${bid}`} style={{ position: "relative" }}>
                {ctx.renderChildren?.(cols, block.id, "row")}
              </div>
            </div>
          </div>
        );
      }

      // Edit mode: apply grid template based on current device preview
      const gridTpl = buildRowGridTemplate(colLayouts, device);
      return (
        <div id={(p.anchor_id as string) || undefined} style={{ ...outer, ...(bg !== undefined ? { background: bg } : {}), position: "relative" }}>
          {pattern && <div style={pattern} />}
          {overlay && <div style={overlay} />}
          <div style={{ ...inner }}>
            <div style={{ display: "grid", gridTemplateColumns: gridTpl, gap, position: "relative" }}>
              {ctx.renderChildren?.(cols, block.id, "row")}
            </div>
          </div>
        </div>
      );
    }

    case "column": {
      const device = ctx.device ?? "desktop";
      const outer = buildOuterStyle(block.layout, "0px", device);
      const overlay = buildOverlayStyle(block.layout);
      const pattern = buildPatternStyle(block.layout);
      const hasLayerBgCol = outer.background || outer.backgroundImage;
      const bg = hasLayerBgCol ? undefined : ((p.bg_color as string) || "transparent");
      const needsRelative = !!(pattern || overlay);
      const respCss = ctx.mode === "live" ? buildResponsiveSpacingCss(block.id, block.layout) : "";
      return (
        <div id={(p.anchor_id as string) || undefined} data-blk={respCss ? block.id : undefined} style={{ ...outer, ...(bg !== undefined ? { background: bg } : {}), minHeight: 0, ...(needsRelative ? { position: "relative" } : {}) }}>
          {respCss && <style dangerouslySetInnerHTML={{ __html: respCss }} />}
          {pattern && <div style={pattern} />}
          {overlay && <div style={overlay} />}
          {ctx.renderChildren?.(block.children ?? [], block.id)}
        </div>
      );
    }

    case "section": {
      const device = ctx.device ?? "desktop";
      const outer = buildOuterStyle(block.layout, "40px 28px", device);
      const overlay = buildOverlayStyle(block.layout);
      const pattern = buildPatternStyle(block.layout);
      const inner = buildInnerStyle(block.layout, ctx.pageMaxWidth);
      const hasLayerBgSec = outer.background || outer.backgroundImage;
      const bg = hasLayerBgSec ? undefined : ((p.bg_color as string) || "transparent");
      const respCss = ctx.mode === "live" ? buildResponsiveSpacingCss(block.id, block.layout) : "";
      return (
        <div id={(p.anchor_id as string) || undefined} data-blk={respCss ? block.id : undefined} style={{ ...outer, ...(bg !== undefined ? { background: bg } : {}), position: "relative" }}>
          {respCss && <style dangerouslySetInnerHTML={{ __html: respCss }} />}
          {pattern && <div style={pattern} />}
          {overlay && <div style={overlay} />}
          <div style={inner}>{ctx.renderChildren?.(block.children ?? [], block.id)}</div>
        </div>
      );
    }

    case "spacer": {
      const h = (p.height as number) ?? 40;
      const heightStyle = hasResp("height") ? (`var(--blk-${bid}-h, ${h}px)` as unknown as number) : h;
      return (
        <div style={{ height: heightStyle, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
      const color = (p.color as string) || "#fff";
      const textAlign = (p.align as string) || "left";
      const fontFamily = p.font_family as string | undefined;
      return (
        <div style={{ padding: "10px 28px" }}>
          <FontLink family={fontFamily} />
          <Editable
            tag="h2"
            richText
            value={(p.text as string) || "Headline"}
            editable={editable}
            onCommit={commit("text")}
            onFocus={focus}
            style={{
              fontSize: hasResp("size") ? (`var(--blk-${bid}-fs, ${size})` as string) : size,
              fontWeight: (p.weight as string) || "bold",
              color: hasResp("color") ? `var(--blk-${bid}-fc, ${color})` : color,
              textAlign: (hasResp("align") ? `var(--blk-${bid}-ta, ${textAlign})` : textAlign) as React.CSSProperties["textAlign"],
              lineHeight: 1.2, margin: 0,
              fontFamily: fontFamily || undefined,
            }}
          />
        </div>
      );
    }

    case "body-text": {
      const bodyFontFamily = p.font_family as string | undefined;
      const bodyFontSize = p.font_size ? `${p.font_size as number}px` : (p.size as string) || "1rem";
      const bodyColor = (p.color as string) || "#c7ccd4";
      const bodyAlign = (p.align as string) || "left";
      return (
        <div style={{ padding: "8px 28px" }}>
          <FontLink family={bodyFontFamily} />
          <Editable
            tag="p"
            richText
            value={(p.text as string) || "Paragraph text…"}
            editable={editable}
            onCommit={commit("text")}
            onFocus={focus}
            style={{
              fontSize: hasResp("font_size") ? `var(--blk-${bid}-fs, ${bodyFontSize})` : bodyFontSize,
              color: hasResp("color") ? `var(--blk-${bid}-fc, ${bodyColor})` : bodyColor,
              textAlign: (hasResp("align") ? `var(--blk-${bid}-ta, ${bodyAlign})` : bodyAlign) as React.CSSProperties["textAlign"],
              lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap",
              fontFamily: bodyFontFamily || undefined,
            }}
          />
        </div>
      );
    }

    case "list": {
      const li = items("items");
      const listIconType = (p.icon_type as string) || "check";
      const listIconColor = (p.icon_color as string) || (p.accent_color as string) || AC;
      const listIconSize = (p.icon_size as number) || 15;
      const listTextColor = (p.text_color as string) || "#d7dbe2";
      const listFontSize = p.text_size ? `${p.text_size as number}px` : "15px";
      const listFontFamily = p.font_family as string | undefined;
      const iconColorStyle = hasResp("icon_color") ? `var(--blk-${bid}-ic, ${listIconColor})` : listIconColor;
      const textColorStyle = hasResp("text_color") ? `var(--blk-${bid}-fc, ${listTextColor})` : listTextColor;
      const fontSizeStyle  = hasResp("text_size")  ? `var(--blk-${bid}-fs, ${listFontSize})`  : listFontSize;
      return (
        <div style={{ padding: "8px 28px" }}>
          <FontLink family={listFontFamily} />
          {li.map((it, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 9 }}>
              <span style={{ flexShrink: 0, marginTop: 3, color: iconColorStyle }}>
                <FunnelIcon name={listIconType} size={listIconSize} strokeWidth={2.2} />
              </span>
              <Editable
                tag="span"
                richText
                value={it.text || ""}
                editable={editable}
                onCommit={commitItem(i, "text")}
                onFocus={focus}
                style={{ color: textColorStyle, fontSize: fontSizeStyle, lineHeight: 1.5, fontFamily: listFontFamily || undefined }}
              />
            </div>
          ))}
        </div>
      );
    }

    case "image": {
      const src = p.src as string | undefined;
      const imgWidth = (p.width as string) || "100%";
      const imgAlign = (p.align as string) || "center";
      const justifyMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
      const imgRadius = (p.radius as number) ?? 0;
      const imgWidthStyle = hasResp("width") ? (`var(--blk-${bid}-iw, ${imgWidth})` as string) : imgWidth;
      const justifyStyle  = hasResp("align") ? (`var(--blk-${bid}-jc, ${justifyMap[imgAlign] || "center"})` as string) : (justifyMap[imgAlign] || "center");
      const imgEl = src ? (
        <img src={src} alt={(p.alt as string) || ""} style={{ width: imgWidthStyle, maxWidth: "100%", display: "block", borderRadius: imgRadius }} />
      ) : editable ? (
        <div style={{ height: 220, width: imgWidthStyle, maxWidth: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 8, color: "#3a4252" }}>
          <FunnelIcon name="image" size={28} strokeWidth={1.4} />
        </div>
      ) : null;
      return (
        <div style={{ padding: "10px 28px", display: "flex", justifyContent: justifyStyle }} onClick={editable ? focus : undefined}>
          {!editable && p.href ? <a href={p.href as string}>{imgEl}</a> : imgEl}
        </div>
      );
    }

    case "video": {
      const url = (p.url as string) || "";
      const poster = (p.poster as string) || "";
      const sizeMap: Record<string, number | string> = { s: 480, m: 680, l: 860, xl: "100%" };
      const sizeProp = (p.size as string) || "m";
      const maxW = sizeMap[sizeProp] ?? 680;
      return (
        <div style={{ padding: "10px 28px" }}>
          <div style={{ maxWidth: maxW === "100%" ? "100%" : maxW, margin: "0 auto", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#000", position: "relative" }}>
            {renderEmbed(block.id, url, ctx.mode, 60, poster)}
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
                  <span style={{ color: (p.accent_color as string) || AC, marginTop: 2 }}><FunnelIcon name="check" size={14} strokeWidth={2.6} /></span>
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
                  <Editable tag="div" richText value={q.a || ""} editable onCommit={commitItem(i, "a")} onFocus={focus} style={{ fontSize: 13.5, color: aColor, lineHeight: 1.55 }} />
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
                <div style={{ fontSize: 13.5, color: aColor, margin: 0, padding: showNum ? "0 16px 14px 60px" : "0 16px 14px", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: q.a || "" }} />
              </details>
            )
          )}
        </div>
      );
    }

    case "stats-bar": {
      if (ctx.mode === "live") return <StatsBarBlock block={block} />;
      const stats = items("items");
      const valColor   = (p.accent_color as string) || (p.value_color as string) || "#fff";
      const lblColor   = (p.label_color as string) || "#7e8794";
      const valSize    = (p.value_size as number) || 34;
      const lblSize    = (p.label_size as number) || 12;
      const uppercase  = p.label_uppercase !== false;
      const showIcons  = Boolean(p.show_icons);
      const dividers   = Boolean(p.dividers);
      const fontFamily = (p.font_family as string) || null;
      return (
        <>
        {fontFamily && <FontLink family={fontFamily} />}
        <div style={{ padding: "32px 28px", display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: dividers ? 0 : "clamp(24px, 5vw, 64px)", fontFamily: fontFamily ? `"${fontFamily}", sans-serif` : undefined }}>
          {stats.map((s, i) => (
            <React.Fragment key={i}>
              {dividers && i > 0 && <div style={{ width: 1, height: 52, background: "rgba(255,255,255,0.12)", flexShrink: 0, alignSelf: "center" }} />}
              <div style={{ textAlign: "center", padding: dividers ? "0 clamp(18px, 4vw, 44px)" : 0 }}>
                {showIcons && (s.icon as string) && (
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                    <FunnelIcon name={s.icon as string} size={24} color={valColor} strokeWidth={1.8} />
                  </div>
                )}
                <Editable tag="div" value={s.value || ""} editable={editable} onCommit={commitItem(i, "value")} onFocus={focus}
                  style={{ fontSize: valSize, fontWeight: 800, color: valColor, lineHeight: 1.15, letterSpacing: "-0.02em" }} />
                <Editable tag="div" value={s.label || ""} editable={editable} onCommit={commitItem(i, "label")} onFocus={focus}
                  style={{ fontSize: lblSize, color: lblColor, marginTop: 7, textTransform: uppercase ? "uppercase" : "none", letterSpacing: uppercase ? "0.07em" : "0", fontWeight: 500 }} />
              </div>
            </React.Fragment>
          ))}
        </div>
        </>
      );
    }

    case "cta-button": {
      const ac = (p.accent_color as string) || AC;
      const size = p.size as "sm" | "md" | "lg" | undefined;
      const pad = size === "lg" ? "18px 44px" : size === "sm" ? "10px 22px" : "15px 34px";
      const fs = size === "lg" ? 18 : size === "sm" ? 13.5 : 16;
      // For live mode: full_width can be toggled per device via CSS variables
      const displayStyle = hasResp("full_width")
        ? (`var(--blk-${bid}-fd, ${p.full_width ? "flex" : "inline-flex"})` as React.CSSProperties["display"])
        : (p.full_width ? "flex" : "inline-flex");
      const widthStyle = hasResp("full_width")
        ? (`var(--blk-${bid}-fw, ${p.full_width ? "100%" : "auto"})` as string)
        : (p.full_width ? "100%" : undefined);
      const ctaFont = (p.font_family as string) || null;
      const btnStyle: React.CSSProperties = {
        display: displayStyle, justifyContent: "center", background: ac, color: (p.text_color as string) || "#fff",
        fontWeight: 700, fontSize: fs, padding: pad, borderRadius: 11, boxShadow: `0 12px 28px -8px ${ac}88`, textDecoration: "none",
        width: widthStyle,
        fontFamily: ctaFont ? `"${ctaFont}", sans-serif` : undefined,
      };
      return (
        <>
          {ctaFont && <FontLink family={ctaFont} />}
          <div style={{ background: (p.bg_color as string) || "transparent", padding: "24px 28px", textAlign: "center" }}>
            {editable ? (
              <Editable tag="span" value={(p.text as string) || "Click here"} editable onCommit={commit("text")} onFocus={focus} style={btnStyle} />
            ) : (
              <a href={(p.url as string) || "#"} style={btnStyle}>{(p.text as string) || "Click here"}</a>
            )}
          </div>
        </>
      );
    }

    case "optin-form": {
      const optinFont = (p.font_family as string) || null;
      return ctx.mode === "live" ? (
        <ChallengeSignupFormBlock block={block} />
      ) : (
        // Canvas preview — mirrors the live ChallengeSignupFormBlock layout closely
        <>
        {optinFont && <FontLink family={optinFont} />}
        <div style={{ background: (p.bg_color as string) || "#f9fafb", padding: "56px 24px", fontFamily: optinFont ? `"${optinFont}", sans-serif` : undefined }}>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            {Boolean(p.section_label) && (
              <p style={{ textAlign: "center", fontSize: 13, color: (p.accent_color as string) || AC, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                {p.section_label as string}
              </p>
            )}
            {Boolean(p.section_heading) && (
              <h2 style={{ textAlign: "center", fontSize: "clamp(22px,4vw,32px)", fontWeight: 800, color: "#111827", marginBottom: 6 }}>
                {p.section_heading as string}
              </h2>
            )}
            {Boolean(p.section_subtext) && (
              <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, marginBottom: 28 }}>
                {p.section_subtext as string}
              </p>
            )}
            <div style={{ background: "#fff", borderRadius: 16, padding: "36px 32px", border: "1px solid #e5e7eb", boxShadow: "0 20px 60px -20px rgba(0,0,0,0.12)" }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{(p.heading as string) || "Join the 7-Day Challenge"}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{(p.subtext as string) || "₦10,000 one-time · Lifetime access to community"}</div>
              </div>
              {(["Full Name", "Email Address", "WhatsApp Number", "Password (for your account)"] as const).map(f => (
                <div key={f} style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "11px 13px", color: "#9ca3af", fontSize: 14, background: "#f9fafb", marginBottom: 10, fontFamily: "inherit" }}>{f}</div>
              ))}
              {p.show_paystack !== false && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "14px 0" }}>
                  <div style={{ border: `2px solid ${(p.accent_color as string) || AC}`, borderRadius: 8, padding: 10, fontSize: 13, color: "#c2410c", background: "#fff7ed", textAlign: "center" }}>🏦 Bank Transfer</div>
                  <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 10, fontSize: 13, color: "#6b7280", background: "#f9fafb", textAlign: "center" }}>💳 Pay Online</div>
                </div>
              )}
              <div style={{ background: (p.accent_color as string) || AC, color: "#fff", fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 10, textAlign: "center" }}>
                I&apos;ve Paid — Register Me →
              </div>
              {Boolean(p.confirmation_note) && (
                <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, marginTop: 10 }}>{p.confirmation_note as string}</p>
              )}
            </div>
          </div>
        </div>
        </>
      );
    }

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
      const iconType  = (p.icon_type   as string) || "check";
      const iconColor = (p.icon_color  as string) || AC;
      const titleColor= (p.title_color as string) || "#ffffff";
      const bodyColor = (p.body_color  as string) || "#9aa4b2";
      const cardBg    = (p.card_bg     as string) || "rgba(255,255,255,0.03)";
      const cardBd    = (p.card_border as string) || "rgba(255,255,255,0.07)";
      const radius    = (p.radius      as number) ?? 12;
      const align     = ((p.align as string) || "left") as React.CSSProperties["textAlign"];
      const showIcon  = p.show_icon !== false;
      return (
        <div style={{ padding: "8px 16px" }}>
          <div style={{ background: cardBg, border: `1px solid ${cardBd}`, borderRadius: radius, padding: "24px", textAlign: align }}>
            {showIcon && (
              <div style={{ display: "flex", justifyContent: align === "center" ? "center" : "flex-start", marginBottom: 14 }}>
                <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 10, background: `${iconColor}18`, border: `1px solid ${iconColor}33`, color: iconColor }}>
                  <FunnelIcon name={iconType} size={22} strokeWidth={1.8} />
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

    case "icon": {
      const iconType  = (p.icon_type  as string) || "star";
      const iconColor = (p.icon_color as string) || AC;
      const iconSize  = (p.icon_size  as number) || 48;
      const iconBg    = (p.icon_bg    as string) || "";
      const iconShape = (p.icon_bg_shape as string) || "circle";
      const iconAlign = (p.align as string) || "center";
      const justifyMap2: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
      const shapeRadius = iconShape === "circle" ? "50%" : iconShape === "square" ? Math.round(iconSize * 0.22) + "px" : 0;
      // CSS variables for live mode responsive overrides (icon_size targets SVG via [data-blk] svg selector in LiveBlockRow)
      const iconColorStyle  = hasResp("icon_color") ? `var(--blk-${bid}-ic, ${iconColor})` : iconColor;
      const justifyStyle2   = hasResp("align")      ? `var(--blk-${bid}-jc, ${justifyMap2[iconAlign] || "center"})` : (justifyMap2[iconAlign] || "center");
      return (
        <div style={{ padding: "12px 28px", display: "flex", justifyContent: justifyStyle2 }} onClick={editable ? focus : undefined}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: iconBg && iconShape !== "none" ? iconSize * 2 : undefined,
            height: iconBg && iconShape !== "none" ? iconSize * 2 : undefined,
            borderRadius: iconBg && iconShape !== "none" ? shapeRadius : undefined,
            background: iconBg && iconShape !== "none" ? iconBg : undefined,
            color: iconColorStyle,
          }}>
            <FunnelIcon name={iconType} size={iconSize} strokeWidth={1.6} />
          </div>
        </div>
      );
    }

    case "icon-box": {
      const iconType    = (p.icon_type    as string) || "bolt";
      const iconColor   = (p.icon_color   as string) || AC;
      const iconSize    = (p.icon_size    as number) || 32;
      const iconPos     = (p.icon_position as string) || "top";
      const titleColor  = (p.title_color  as string) || "#ffffff";
      const bodyColor   = (p.body_color   as string) || "#9aa4b2";
      const titleSize   = (p.title_size   as number) || 18;
      const bodySize    = (p.body_size    as number) || 15;
      // CSS variable refs for live mode responsive overrides
      const iconColorStyle = hasResp("icon_color")   ? `var(--blk-${bid}-ic, ${iconColor})`   : iconColor;
      const titleSizeStyle = hasResp("title_size")   ? `var(--blk-${bid}-ts, ${titleSize}px)` : `${titleSize}px`;
      const bodySizeStyle  = hasResp("body_size")    ? `var(--blk-${bid}-bs, ${bodySize}px)`  : `${bodySize}px`;
      const iconPosDir     = iconPos === "left" ? "row" : iconPos === "right" ? "row-reverse" : "column";
      const flexDirStyle   = (hasResp("icon_position")
        ? `var(--blk-${bid}-ipos, ${iconPosDir})`
        : iconPosDir) as React.CSSProperties["flexDirection"];
      // Icon wrapper: use calc() so the container scales when icon_size changes
      const iconWrapSize = hasResp("icon_size")
        ? `calc(var(--blk-${bid}-is, ${iconSize}px) + 24px)`
        : `${iconSize + 24}px`;
      const iconEl = (
        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: iconWrapSize, height: iconWrapSize, borderRadius: 10,
          background: `${iconColorStyle}18`, border: `1px solid ${iconColorStyle}33`,
          color: iconColorStyle, flexShrink: 0 }}>
          <FunnelIcon name={iconType} size={iconSize} strokeWidth={1.7} />
        </div>
      );
      const textEl = (
        <div style={{ flex: iconPos === "left" || iconPos === "right" ? 1 : undefined }}>
          <Editable tag="h3" richText value={(p.title as string) || "Feature title"} editable={editable} onCommit={commit("title")} onFocus={focus}
            style={{ fontSize: titleSizeStyle, fontWeight: 700, color: titleColor, margin: "0 0 8px", lineHeight: 1.3 }} />
          <Editable tag="p" richText value={(p.body as string) || "A short description."} editable={editable} onCommit={commit("body")} onFocus={focus}
            style={{ fontSize: bodySizeStyle, color: bodyColor, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }} />
          {Boolean(p.link_text) && (
            <div style={{ marginTop: 10 }}>
              {editable
                ? <span style={{ fontSize: 13, fontWeight: 600, color: iconColorStyle }}>{p.link_text as string} →</span>
                : <a href={(p.link_url as string) || "#"} style={{ fontSize: 13, fontWeight: 600, color: iconColorStyle, textDecoration: "none" }}>{p.link_text as string} →</a>
              }
            </div>
          )}
        </div>
      );
      return (
        <div style={{ padding: "8px 16px" }}>
          <div style={{ display: "flex", flexDirection: flexDirStyle, alignItems: "flex-start", gap: 16 }}>
            {iconEl}
            {textEl}
          </div>
        </div>
      );
    }

    case "icon-list": {
      const ilItems = items("items");
      const ilIconColor  = (p.icon_color as string) || AC;
      const ilIconSize   = (p.icon_size as number) || 16;
      const ilTextColor  = (p.text_color as string) || "#d7dbe2";
      const ilFontSize   = p.text_size ? `${p.text_size as number}px` : "15px";
      const ilFontFamily = p.font_family as string | undefined;
      const ilIconColorStyle = hasResp("icon_color") ? `var(--blk-${bid}-ic, ${ilIconColor})` : ilIconColor;
      const ilTextColorStyle = hasResp("text_color") ? `var(--blk-${bid}-fc, ${ilTextColor})` : ilTextColor;
      const ilFontSizeStyle  = hasResp("text_size")  ? `var(--blk-${bid}-fs, ${ilFontSize})`  : ilFontSize;
      return (
        <div style={{ padding: "8px 28px" }}>
          <FontLink family={ilFontFamily} />
          {ilItems.map((it, i) => {
            const itemIconType = (it.icon_type as string) || (p.icon_type as string) || "check";
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 9 }}>
                <span style={{ flexShrink: 0, marginTop: 2, color: ilIconColorStyle }}>
                  <FunnelIcon name={itemIconType} size={ilIconSize} strokeWidth={2.2} />
                </span>
                <Editable
                  tag="span"
                  richText
                  value={it.text || ""}
                  editable={editable}
                  onCommit={commitItem(i, "text")}
                  onFocus={focus}
                  style={{ color: ilTextColorStyle, fontSize: ilFontSizeStyle, lineHeight: 1.5, fontFamily: ilFontFamily || undefined }}
                />
              </div>
            );
          })}
        </div>
      );
    }

    default:
      return null;
  }
}

export type { BlockLayout };
