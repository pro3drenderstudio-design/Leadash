"use client";
import { useState } from "react";

/**
 * Shared rich-media rendering for CRM message bubbles — used by both the
 * admin support inbox (admin/crm, light/dark adaptive) and the outreach
 * user-dashboard CRM ((app)/crm, permanently dark, no dark: variants used).
 * Pass forceDark from the outreach CRM to match its fixed dark palette;
 * omit it (default) for the admin CRM's light/dark-adaptive styling.
 */

export interface RichAttachment {
  name:     string;
  mimeType: string;
  size:     number;
  url:      string;
}

export interface RichLocation {
  latitude:  number;
  longitude: number;
  name?:     string;
  address?:  string;
}

export interface RichContact {
  name:  string;
  phone: string;
}

interface ThemeProps { forceDark?: boolean; }

function theme(forceDark?: boolean) {
  return forceDark
    ? {
        chipBg:     "bg-white/5 hover:bg-white/10",
        chipBorder: "border-white/8 hover:border-white/15",
        text:       "text-white/60",
        subtext:    "text-white/30",
        imgBorder:  "border-white/10 hover:border-white/20",
        iconMuted:  "text-white/40",
      }
    : {
        chipBg:     "bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10",
        chipBorder: "border-slate-200 dark:border-white/8 hover:border-slate-300 dark:hover:border-white/15",
        text:       "text-slate-700 dark:text-white/60",
        subtext:    "text-slate-400 dark:text-white/30",
        imgBorder:  "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20",
        iconMuted:  "text-slate-400 dark:text-white/40",
      };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}

// ── Link auto-detection ────────────────────────────────────────────────────

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Renders plain text with bare URLs turned into clickable links. Text color
 *  is inherited from the parent bubble (already theme-correct there), so no
 *  forceDark prop is needed here. Safe for plain-text bodies only — never
 *  pass raw HTML through this. */
export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        URL_RE.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:opacity-80"
              onClick={e => e.stopPropagation()}>
              {part}
            </a>
          : <span key={i}>{part}</span>,
      )}
    </span>
  );
}

// ── Image (thumbnail + lightbox) ───────────────────────────────────────────

function ImageAttachment({ att, forceDark }: { att: RichAttachment } & ThemeProps) {
  const [open, setOpen] = useState(false);
  const t = theme(forceDark);
  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className={`block rounded-lg overflow-hidden border ${t.imgBorder} transition-colors max-w-[220px]`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={att.url} alt={att.name} className="block w-full h-auto max-h-[220px] object-cover" loading="lazy" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={att.url} alt={att.name} className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

function AudioAttachment({ att }: { att: RichAttachment }) {
  return (
    <div className="flex items-center gap-2 max-w-[280px]" onClick={e => e.stopPropagation()}>
      <audio controls preload="none" src={att.url} className="h-9 max-w-[240px]" />
    </div>
  );
}

function VideoAttachment({ att, forceDark }: { att: RichAttachment } & ThemeProps) {
  const t = theme(forceDark);
  return (
    <video
      controls
      preload="metadata"
      src={att.url}
      className={`rounded-lg border ${t.imgBorder} max-w-[260px] max-h-[220px]`}
      onClick={e => e.stopPropagation()}
    />
  );
}

function FileAttachment({ att, forceDark }: { att: RichAttachment } & ThemeProps) {
  const t = theme(forceDark);
  return (
    <a
      href={att.url} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors text-xs max-w-[260px] ${t.chipBg} ${t.chipBorder}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 flex-shrink-0 ${t.iconMuted}`}>
        <path fillRule="evenodd" d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z" clipRule="evenodd"/>
      </svg>
      <span className={`flex-1 truncate ${t.text}`}>{att.name}</span>
      <span className={`text-[10px] flex-shrink-0 ${t.subtext}`}>{formatSize(att.size)}</span>
    </a>
  );
}

/** Dispatches each attachment to the right renderer by mimeType prefix. */
export function AttachmentGrid({ attachments, forceDark }: { attachments: RichAttachment[] | null | undefined } & ThemeProps) {
  if (!attachments?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((att, i) => {
        if (att.mimeType?.startsWith("image/")) return <ImageAttachment key={i} att={att} forceDark={forceDark} />;
        if (att.mimeType?.startsWith("audio/")) return <AudioAttachment key={i} att={att} />;
        if (att.mimeType?.startsWith("video/")) return <VideoAttachment key={i} att={att} forceDark={forceDark} />;
        return <FileAttachment key={i} att={att} forceDark={forceDark} />;
      })}
    </div>
  );
}

// ── Location share ──────────────────────────────────────────────────────────

export function LocationCard({ location, forceDark }: { location: RichLocation | null | undefined } & ThemeProps) {
  if (!location) return null;
  const t = theme(forceDark);
  const mapsUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
  return (
    <a
      href={mapsUrl} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-xs mt-2 max-w-[260px] ${t.chipBg} ${t.chipBorder}`}
    >
      <span className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-emerald-400">
          <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.976.544l.062.029.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd"/>
        </svg>
      </span>
      <div className="min-w-0">
        <p className={`font-medium truncate ${t.text}`}>{location.name || "Shared location"}</p>
        <p className={`text-[10px] truncate ${t.subtext}`}>{location.address || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`}</p>
      </div>
    </a>
  );
}

// ── Contact share ─────────────────────────────────────────────────────────

export function ContactCard({ contacts, forceDark }: { contacts: RichContact[] | null | undefined } & ThemeProps) {
  if (!contacts?.length) return null;
  const t = theme(forceDark);
  return (
    <div className="flex flex-col gap-1.5 mt-2">
      {contacts.map((c, i) => (
        <a
          key={i}
          href={`tel:${c.phone}`}
          onClick={e => e.stopPropagation()}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-xs max-w-[260px] ${t.chipBg} ${t.chipBorder}`}
        >
          <span className="w-7 h-7 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0 text-orange-400 font-bold text-[10px]">
            {c.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className={`font-medium truncate ${t.text}`}>{c.name}</p>
            <p className={`text-[10px] truncate ${t.subtext}`}>{c.phone}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

// ── Sandboxed HTML email body ───────────────────────────────────────────────

/** Same auto-height sandboxed-iframe technique already used for outbound
 *  email HTML in the outreach CRM — reused here so it applies to both
 *  directions and both CRM surfaces. Renders its own isolated dark-styled
 *  document regardless of the outer page's theme, matching the existing
 *  precedent this was lifted from. */
export function HtmlBody({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={`<html><head><style>html,body{margin:0;padding:0;background:transparent}body{font-family:sans-serif;font-size:13px;color:#ccc;line-height:1.6}a{color:#7dd3fc}*{max-width:100%;box-sizing:border-box}</style></head><body>${html}</body></html>`}
      sandbox="allow-same-origin"
      className="w-full border-0 min-h-[60px]"
      style={{ height: "auto", background: "transparent", colorScheme: "dark" } as React.CSSProperties}
      onLoad={(e) => {
        const iframe = e.currentTarget;
        if (iframe.contentDocument?.body) iframe.style.height = iframe.contentDocument.body.scrollHeight + "px";
      }}
    />
  );
}
