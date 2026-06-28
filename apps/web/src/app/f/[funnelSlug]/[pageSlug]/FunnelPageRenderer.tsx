"use client";
import { useEffect, useState, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Block {
  id:    string;
  type:  string;
  props: Record<string, unknown>;
}

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

// ── Session tracking ──────────────────────────────────────────────────────────

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

// ── Block Renderer ────────────────────────────────────────────────────────────

interface OptinFormState {
  fields: Record<string, string>;
  submitting: boolean;
  submitted: boolean;
  error: string;
}

function OptinFormBlock({
  block,
  pageId,
  sessionId,
}: {
  block: Block;
  pageId: string;
  sessionId: string;
}) {
  const p = block.props;
  const formFields = (p.fields as Array<{type: string; label: string; required: boolean}>) ?? [];
  const [state, setState] = useState<OptinFormState>({
    fields: {},
    submitting: false,
    submitted: false,
    error: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState(s => ({ ...s, submitting: true, error: "" }));
    try {
      const res = await fetch("/api/funnels/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          page_id:     pageId,
          session_id:  sessionId,
          data:        state.fields,
          connect_crm: p.connect_crm ?? true,
          redirect_url: p.redirect_url ?? null,
        }),
      });
      const d = await res.json() as { ok?: boolean; redirect_url?: string; error?: string };
      if (!res.ok) {
        setState(s => ({ ...s, submitting: false, error: d.error ?? "Submission failed" }));
        return;
      }
      // Track conversion event
      await fetch("/api/funnels/track", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type: "event", session_id: sessionId, page_id: pageId, event_type: "conversion" }),
      });
      if (d.redirect_url) {
        window.location.href = d.redirect_url;
        return;
      }
      setState(s => ({ ...s, submitting: false, submitted: true }));
    } catch {
      setState(s => ({ ...s, submitting: false, error: "Network error" }));
    }
  }

  if (state.submitted) {
    return (
      <div
        style={{ backgroundColor: (p.bg_color as string) ?? "#111111", padding: "32px 24px", textAlign: "center", borderRadius: "12px", maxWidth: "480px", margin: "16px auto" }}
      >
        <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🎉</div>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: "1.25rem", marginBottom: "8px" }}>You&apos;re in!</p>
        <p style={{ color: "#888", fontSize: "0.875rem" }}>Check your inbox for next steps.</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: (p.bg_color as string) ?? "#111111", padding: "32px 24px", borderRadius: "12px", maxWidth: "480px", margin: "16px auto" }}>
      {Boolean(p.title) && (
        <h3 style={{ color: "#fff", fontWeight: 700, fontSize: "1.5rem", marginBottom: "20px", textAlign: "center" }}>
          {p.title as string}
        </h3>
      )}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {formFields.map((field) => (
          <div key={field.type}>
            <label style={{ color: "#999", fontSize: "0.75rem", display: "block", marginBottom: "4px" }}>
              {field.label}{field.required && " *"}
            </label>
            <input
              type={field.type === "email" ? "email" : "text"}
              placeholder={field.label}
              required={field.required}
              value={state.fields[field.type] ?? ""}
              onChange={e => setState(s => ({ ...s, fields: { ...s.fields, [field.type]: e.target.value } }))}
              style={{
                width: "100%",
                backgroundColor: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "10px 14px",
                color: "#fff",
                fontSize: "0.875rem",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
        {state.error && <p style={{ color: "#f87171", fontSize: "0.75rem" }}>{state.error}</p>}
        <button
          type="submit"
          disabled={state.submitting}
          style={{
            backgroundColor: "#f97316",
            color: "#fff",
            padding: "14px",
            borderRadius: "8px",
            fontWeight: 700,
            fontSize: "1rem",
            border: "none",
            cursor: state.submitting ? "not-allowed" : "pointer",
            opacity: state.submitting ? 0.7 : 1,
          }}
        >
          {state.submitting ? "Submitting…" : (p.button_text as string) || "Submit"}
        </button>
      </form>
    </div>
  );
}

// ── Countdown Timer ───────────────────────────────────────────────────────────

function CountdownBlock({ block }: { block: Block }) {
  const p = block.props;
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    function calc() {
      let targetMs: number;
      if (p.evergreen) {
        const key = `ld_cd_${block.id}`;
        let stored = sessionStorage.getItem(key);
        if (!stored) {
          stored = String(Date.now() + ((p.duration_minutes as number) ?? 30) * 60_000);
          sessionStorage.setItem(key, stored);
        }
        targetMs = Number(stored);
      } else {
        targetMs = new Date((p.target_date as string) ?? "").getTime();
        if (Number.isNaN(targetMs)) targetMs = Date.now() + 30 * 60_000;
      }
      const diff = Math.max(0, targetMs - Date.now());
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTimeLeft({ d, h, m, s });
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [block.id, p]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const accent = (p.accent_color as string) ?? "#f97316";

  return (
    <div style={{ backgroundColor: (p.bg_color as string) ?? "#111", padding: "24px", textAlign: "center" }}>
      <p style={{ color: "#fff", fontSize: "0.875rem", marginBottom: "12px" }}>{(p.label as string) || "Offer ends in:"}</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
        {[["d","Days"],["h","Hours"],["m","Mins"],["s","Secs"]].map(([k,lbl]) => (
          <div key={k} style={{ textAlign: "center" }}>
            <div style={{ backgroundColor: accent, color: "#fff", fontSize: "2rem", fontWeight: 800, padding: "8px 16px", borderRadius: "8px", minWidth: "64px" }}>
              {pad(timeLeft[k as keyof typeof timeLeft])}
            </div>
            <p style={{ color: "#777", fontSize: "0.625rem", textTransform: "uppercase", marginTop: "4px" }}>{lbl}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Single block public render ────────────────────────────────────────────────

function PublicBlock({ block, pageId, sessionId }: { block: Block; pageId: string; sessionId: string }) {
  const p = block.props;

  switch (block.type) {
    case "headline":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "16px 24px" }}>
          <p style={{
            fontSize: p.size === "5xl" ? "3rem" : p.size === "4xl" ? "2.25rem" : p.size === "3xl" ? "1.875rem" : p.size === "2xl" ? "1.5rem" : "1.25rem",
            color: (p.color as string) ?? "#ffffff",
            textAlign: (p.align as "left"|"center"|"right") ?? "center",
            fontWeight: p.weight === "bold" ? 700 : 600,
            lineHeight: 1.2,
          }}>
            {(p.text as string) || ""}
          </p>
        </div>
      );

    case "body-text":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "12px 24px" }}>
          <p style={{ color: (p.color as string) ?? "#999", textAlign: (p.align as "left"|"center"|"right") ?? "left", fontSize: "1rem", lineHeight: 1.7 }}>
            {(p.text as string) || ""}
          </p>
        </div>
      );

    case "list":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "12px 24px" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {((p.items as string[]) ?? []).map((item, i) => (
              <li key={i} style={{ color: (p.color as string) ?? "#ccc", display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "6px", fontSize: "0.875rem" }}>
                <span style={{ color: "#f97316", flexShrink: 0, marginTop: "2px" }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      );

    case "image":
      return p.src ? (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "8px 24px", textAlign: "center" }}>
          {p.href ? (
            <a href={p.href as string}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src as string} alt={(p.alt as string) ?? ""} style={{ maxWidth: "100%", borderRadius: "8px" }} />
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.src as string} alt={(p.alt as string) ?? ""} style={{ maxWidth: "100%", borderRadius: "8px" }} />
          )}
        </div>
      ) : null;

    case "video":
      return p.url ? (
        <div style={{ padding: "8px 24px" }}>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: "8px", overflow: "hidden" }}>
            <iframe
              src={`${(p.url as string).replace("watch?v=", "embed/")}${p.autoplay ? "?autoplay=1&mute=1" : ""}`}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
              allowFullScreen
            />
          </div>
        </div>
      ) : null;

    case "hero":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "#0c0c0f", padding: "64px 24px", textAlign: "center" }}>
          {Boolean(p.eyebrow) && (
            <div style={{ display: "inline-block", backgroundColor: "rgba(249,115,22,.12)", color: "#fb923c", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", padding: "6px 13px", borderRadius: "999px", marginBottom: "22px" }}>
              {p.eyebrow as string}
            </div>
          )}
          <h1 style={{ color: (p.text_color as string) ?? "#fff", fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, marginBottom: "16px", lineHeight: 1.1 }}>
            {(p.headline as string) || ""}
          </h1>
          {Boolean(p.subtext) && (
            <p style={{ color: "#aaa", fontSize: "1.125rem", marginBottom: "32px", maxWidth: "600px", margin: "0 auto 32px" }}>
              {p.subtext as string}
            </p>
          )}
          {Boolean(p.cta_text) && (
            <a
              href={(p.cta_url as string) ?? "#"}
              style={{ backgroundColor: "#f97316", color: "#fff", padding: "16px 40px", borderRadius: "8px", fontWeight: 700, fontSize: "1.125rem", display: "inline-block", textDecoration: "none" }}
            >
              {p.cta_text as string}
            </a>
          )}
        </div>
      );

    case "countdown-timer":
      return <CountdownBlock block={block} />;

    case "testimonial":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "#111", padding: "32px 24px" }}>
          <p style={{ color: "#ddd", fontSize: "1.125rem", fontStyle: "italic", marginBottom: "20px" }}>
            &ldquo;{p.quote as string}&rdquo;
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontWeight: 700 }}>{((p.author as string) || "A")[0].toUpperCase()}</span>
            </div>
            <div>
              <p style={{ color: "#fff", fontWeight: 600, margin: 0 }}>{p.author as string}</p>
              <p style={{ color: "#666", fontSize: "0.75rem", margin: "2px 0 0" }}>{p.role as string}</p>
            </div>
          </div>
        </div>
      );

    case "pricing-card":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "#111", border: (p.highlight as boolean) ? "2px solid #f97316" : "1px solid #333", padding: "32px 24px", borderRadius: "16px", maxWidth: "360px", margin: "16px auto" }}>
          <p style={{ color: "#f97316", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>{p.title as string}</p>
          <p style={{ color: "#fff", fontSize: "2.5rem", fontWeight: 800, margin: "0 0 4px" }}>{p.price as string}</p>
          <p style={{ color: "#666", fontSize: "0.75rem", marginBottom: "20px" }}>{p.period as string}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px" }}>
            {((p.features as string[]) ?? []).map((f, i) => (
              <li key={i} style={{ color: "#ccc", display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px", fontSize: "0.875rem" }}>
                <span style={{ color: "#f97316" }}>✓</span>{f}
              </li>
            ))}
          </ul>
          <a
            href={(p.cta_url as string) ?? "#"}
            style={{ display: "block", backgroundColor: "#f97316", color: "#fff", padding: "14px", borderRadius: "8px", textAlign: "center", fontWeight: 700, textDecoration: "none" }}
          >
            {p.cta_text as string}
          </a>
        </div>
      );

    case "faq-accordion": {
      const items = (p.items as Array<{q:string;a:string}>) ?? [];
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "24px" }}>
          {items.map((item, i) => (
            <details key={i} style={{ borderBottom: "1px solid #333", marginBottom: "8px" }}>
              <summary style={{ color: "#fff", fontWeight: 600, padding: "12px 0", cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {item.q}
                <span style={{ color: "#f97316", fontSize: "1.25rem" }}>+</span>
              </summary>
              <p style={{ color: "#777", fontSize: "0.875rem", paddingBottom: "12px", lineHeight: 1.6, margin: 0 }}>{item.a}</p>
            </details>
          ))}
        </div>
      );
    }

    case "stats-bar":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "#111", padding: "32px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-around", gap: "24px", flexWrap: "wrap" }}>
            {((p.items as Array<{label:string;value:string}>) ?? []).map((stat, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <p style={{ color: "#f97316", fontSize: "2rem", fontWeight: 800, margin: 0 }}>{stat.value}</p>
                <p style={{ color: "#777", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", margin: "4px 0 0" }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "cta-button":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "16px 24px", textAlign: "center" }}>
          <a
            href={(p.url as string) ?? "#"}
            style={{
              backgroundColor: (p.accent_color as string) ?? "#f97316",
              color: (p.text_color as string) ?? "#fff",
              padding: p.size === "lg" ? "16px 48px" : p.size === "sm" ? "8px 24px" : "12px 32px",
              borderRadius: "8px",
              fontWeight: 700,
              fontSize: p.size === "lg" ? "1.125rem" : p.size === "sm" ? "0.875rem" : "1rem",
              display: (p.full_width as boolean) ? "block" : "inline-block",
              textDecoration: "none",
            }}
          >
            {(p.text as string) || "Click Here"}
          </a>
        </div>
      );

    case "optin-form":
      return <OptinFormBlock block={block} pageId={pageId} sessionId={sessionId} />;

    case "spacer":
      return <div style={{ height: (p.height as string) ?? "40px" }} />;

    case "divider":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "8px 24px" }}>
          <hr style={{ border: "none", borderTop: `${(p.thickness as string) ?? "1px"} solid ${(p.color as string) ?? "#333"}` }} />
        </div>
      );

    case "section":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "24px" }}>
          <div />
        </div>
      );

    case "two-column":
      return (
        <div style={{ backgroundColor: (p.bg_color as string) ?? "transparent", padding: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div><p style={{ color: "#ccc", fontSize: "0.875rem" }}>{p.left as string}</p></div>
          <div><p style={{ color: "#ccc", fontSize: "0.875rem" }}>{p.right as string}</p></div>
        </div>
      );

    case "custom-html":
      return <div dangerouslySetInnerHTML={{ __html: (p.html as string) ?? "" }} />;

    default:
      return null;
  }
}

// ── Main Renderer ─────────────────────────────────────────────────────────────

export default function FunnelPageRenderer({
  funnelId,
  funnelSlug,
  pageId,
  pageSlug,
  pageName,
  blocks,
  settings,
  connection,
  globalStyles,
}: Props) {
  const sessionIdRef = useRef<string>("");
  const trackedRef   = useRef(false);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    const sid = getSessionId();
    sessionIdRef.current = sid;
    setSessionId(sid);

    if (trackedRef.current) return;
    trackedRef.current = true;

    // Record session
    const utm = getUtmParams();
    fetch("/api/funnels/track", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "session", funnel_id: funnelId, session_id: sid, ...utm }),
    }).catch(() => {});

    // Record pageview event
    fetch("/api/funnels/track", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type: "event", session_id: sid, page_id: pageId, event_type: "view" }),
    }).catch(() => {});
  }, [funnelId, pageId]);

  const bgColor = (settings.bg_color as string) ?? (globalStyles.bg_color as string) ?? "#0c0c0f";

  return (
    <div style={{ backgroundColor: bgColor, minHeight: "100vh", fontFamily: (globalStyles.font as string) ?? "Inter, sans-serif" }}>
      {blocks.map(block => (
        <PublicBlock key={block.id} block={block} pageId={pageId} sessionId={sessionId} />
      ))}
    </div>
  );
}
