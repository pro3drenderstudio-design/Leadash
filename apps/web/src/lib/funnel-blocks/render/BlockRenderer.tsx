"use client";
import React from "react";
import { Block, BlockLayout } from "../types";
import { Editable } from "./Editable";
import { Icon } from "./icons";
import { buildOuterStyle, buildOverlayStyle, buildInnerStyle, fluid } from "./wrappers";
import { CountdownBlock } from "./interactive/CountdownBlock";
import { OptinFormBlock } from "./interactive/OptinFormBlock";
import { publishVideoTime } from "./interactive/videoTimeBus";
import { YouTubePlayer } from "./interactive/YouTubePlayer";
import { FunnelTracking } from "@/lib/tracking/pixels";
import styles from "./blocks.module.css";

export type RenderMode = "edit" | "live";

export interface BlockRenderContext {
  mode: RenderMode;
  pageMaxWidth: number;
  selectedId?: string | null;
  pageId?: string;
  sessionId?: string;
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
      return (
        <div style={{ ...outer, background: bg, position: "relative" }}>
          {overlay && <div style={overlay} />}
          <div style={{ ...inner }}>
            <div className={styles.row} style={{ gap: 16, position: "relative" }}>
              {ctx.renderChildren?.(block.children ?? [], block.id)}
            </div>
          </div>
        </div>
      );
    }

    case "column": {
      const outer = buildOuterStyle(block.layout, "16px");
      const bg = (p.bg_color as string) || (outer.backgroundImage ? undefined : "transparent");
      return (
        <div style={{ ...outer, background: bg, minHeight: 0, height: "100%" }}>
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
        <div style={{ ...outer, background: bg, position: "relative" }}>
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
      return (
        <div style={{ padding: "10px 28px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto", aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", background: "#000", position: "relative" }}>
            {renderEmbed(block.id, url, ctx.mode)}
          </div>
        </div>
      );
    }

    case "hero": {
      return (
        <div style={{ padding: `${fluid(48, 96)} ${fluid(20, 28)}`, textAlign: (p.align as React.CSSProperties["textAlign"]) || "center", background: (p.bg_color as string) || "transparent" }}>
          <Editable
            tag="h1"
            value={(p.headline as string) || "Your big promise headline"}
            editable={editable}
            onCommit={commit("headline")}
            onFocus={focus}
            style={{ fontSize: fluid(32, 56), fontWeight: 800, color: (p.color as string) || "#fff", lineHeight: 1.1, margin: "0 auto", maxWidth: 780 }}
          />
          <Editable
            tag="p"
            value={(p.subtext as string) || "Supporting subtext that explains the offer."}
            editable={editable}
            onCommit={commit("subtext")}
            onFocus={focus}
            style={{ fontSize: fluid(15, 19), color: (p.subtext_color as string) || "#aeb6c2", marginTop: 18, maxWidth: 620, margin: "18px auto 0" }}
          />
          {Boolean(p.button_text) && (
            <div style={{ marginTop: 30, display: "flex", justifyContent: "center" }}>
              {(() => {
                const btnStyle: React.CSSProperties = { display: "inline-flex", background: (p.accent_color as string) || AC, color: "#fff", fontWeight: 700, fontSize: 16, padding: "15px 36px", borderRadius: 11, boxShadow: `0 14px 30px -10px ${(p.accent_color as string) || AC}99`, textDecoration: "none" };
                return editable ? (
                  <span style={btnStyle}>{p.button_text as string}</span>
                ) : (
                  <a href={(p.button_url as string) || "#"} style={btnStyle}>{p.button_text as string}</a>
                );
              })()}
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

    case "testimonial":
      return (
        <div style={{ padding: "24px 28px", maxWidth: 620, margin: "0 auto" }}>
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "26px 24px" }}>
            {Boolean(p.video_url) && (
              <div style={{ aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", background: "#000", marginBottom: 18, position: "relative" }}>
                {renderEmbed(block.id, p.video_url as string, ctx.mode, 46)}
              </div>
            )}
            <Editable
              tag="p"
              value={(p.quote as string) || "This changed everything for me."}
              editable={editable}
              onCommit={commit("quote")}
              onFocus={focus}
              style={{ fontSize: fluid(15, 17), color: "#e7ecf3", lineHeight: 1.6, fontStyle: "italic", margin: 0 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
              {Boolean(p.avatar) && <img src={p.avatar as string} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />}
              <div>
                <Editable tag="div" value={(p.name as string) || "Jane Doe"} editable={editable} onCommit={commit("name")} onFocus={focus} style={{ fontWeight: 700, fontSize: 13.5, color: "#fff" }} />
                <Editable tag="div" value={(p.role as string) || ""} editable={editable} onCommit={commit("role")} onFocus={focus} style={{ fontSize: 12, color: "#7e8794" }} />
              </div>
            </div>
          </div>
        </div>
      );

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
      const qs = items("items");
      return (
        <div style={{ padding: "16px 28px", display: "flex", flexDirection: "column", gap: 10, maxWidth: 700, margin: "0 auto" }}>
          {qs.map((q, i) =>
            editable ? (
              <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                <Editable tag="div" value={q.q || ""} editable onCommit={commitItem(i, "q")} onFocus={focus} style={{ fontWeight: 700, fontSize: 14.5, color: "#fff" }} />
                <Editable tag="div" value={q.a || ""} editable onCommit={commitItem(i, "a")} onFocus={focus} style={{ fontSize: 13.5, color: "#9aa3b0", marginTop: 6, lineHeight: 1.55 }} />
              </div>
            ) : (
              <details key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
                <summary style={{ fontWeight: 700, fontSize: 14.5, color: "#fff", cursor: "pointer", listStyle: "none" }}>{q.q}</summary>
                <p style={{ fontSize: 13.5, color: "#9aa3b0", marginTop: 8, lineHeight: 1.55 }}>{q.a}</p>
              </details>
            )
          )}
        </div>
      );
    }

    case "stats-bar": {
      const stats = items("items");
      return (
        <div style={{ padding: "26px 28px", display: "flex", justifyContent: "center", gap: fluid(22, 64), flexWrap: "wrap" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <Editable tag="div" value={s.value || ""} editable={editable} onCommit={commitItem(i, "value")} onFocus={focus} style={{ fontSize: fluid(24, 34), fontWeight: 800, color: "#fff" }} />
              <Editable tag="div" value={s.label || ""} editable={editable} onCommit={commitItem(i, "label")} onFocus={focus} style={{ fontSize: 12, color: "#7e8794", marginTop: 4 }} />
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
      return ctx.mode === "live" && ctx.pageId ? (
        <OptinFormBlock block={block} pageId={ctx.pageId} sessionId={ctx.sessionId ?? ""} tracking={ctx.tracking} />
      ) : (
        <div style={{ background: (p.bg_color as string) || "#0e1017", padding: `${fluid(40, 50)} ${fluid(22, 32)}` }}>
          <div style={{ maxWidth: 430, margin: "0 auto", background: "#0c0c0f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "30px 26px", boxShadow: "0 24px 60px -24px rgba(0,0,0,.75)" }}>
            {Boolean(p.title) && (
              <Editable tag="h3" value={p.title as string} editable onCommit={commit("title")} onFocus={focus} style={{ fontSize: 22, fontWeight: 700, color: "#fff", textAlign: "center", marginBottom: 18 }} />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(((p.fields as Array<{ type: string; label: string }>) ?? [])).map(f => (
                <div key={f.type} style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 13px", color: "#5b6678", fontSize: 14, background: "#08090d" }}>
                  {f.label}
                </div>
              ))}
              <div style={{ background: "linear-gradient(180deg,#fb923c,#f97316)", color: "#fff", fontWeight: 700, fontSize: 15, padding: 13, borderRadius: 10, textAlign: "center" }}>
                {(p.button_text as string) || "Submit"}
              </div>
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

    default:
      return null;
  }
}

export type { BlockLayout };
