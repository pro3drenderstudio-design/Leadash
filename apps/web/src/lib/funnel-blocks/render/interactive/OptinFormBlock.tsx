"use client";
import { useState } from "react";
import { Block } from "../../types";
import { fluid } from "../wrappers";
import { FunnelTracking, trackLead } from "@/lib/tracking/pixels";

interface OptinFormState {
  fields: Record<string, string>;
  submitting: boolean;
  submitted: boolean;
  error: string;
}

export function OptinFormBlock({ block, pageId, sessionId, tracking }: { block: Block; pageId: string; sessionId: string; tracking?: FunnelTracking | null }) {
  const p = block.props;
  const formFields = (p.fields as Array<{ type: string; label: string; required: boolean }>) ?? [];
  const bg = (p.bg_color as string) || "#0e1017";
  const [state, setState] = useState<OptinFormState>({ fields: {}, submitting: false, submitted: false, error: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState(s => ({ ...s, submitting: true, error: "" }));
    try {
      const res = await fetch("/api/funnels/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: pageId,
          session_id: sessionId,
          data: state.fields,
          connect_crm: p.connect_crm ?? true,
          redirect_url: p.redirect_url ?? null,
        }),
      });
      const d = await res.json() as { ok?: boolean; redirect_url?: string; error?: string };
      if (!res.ok) {
        setState(s => ({ ...s, submitting: false, error: d.error ?? "Submission failed" }));
        return;
      }
      await fetch("/api/funnels/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "event", session_id: sessionId, page_id: pageId, event_type: "conversion" }),
      }).catch(() => {});
      trackLead(tracking);
      if (d.redirect_url) {
        window.location.href = d.redirect_url;
        return;
      }
      setState(s => ({ ...s, submitting: false, submitted: true }));
    } catch {
      setState(s => ({ ...s, submitting: false, error: "Network error" }));
    }
  }

  const cardStyle: React.CSSProperties = {
    maxWidth: 430, margin: "0 auto", background: "#0c0c0f", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18, padding: "30px 26px", boxShadow: "0 24px 60px -24px rgba(0,0,0,.75)",
  };

  if (state.submitted) {
    return (
      <div style={{ background: bg, padding: `${fluid(40, 50)} ${fluid(22, 32)}` }}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>You&apos;re in! 🎉</p>
          <p style={{ color: "#8b95a3", fontSize: 13 }}>Check your inbox for next steps.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: bg, padding: `${fluid(40, 50)} ${fluid(22, 32)}` }}>
      <div style={cardStyle}>
        {Boolean(p.title) && (
          <h3 style={{ fontSize: 22, fontWeight: 700, color: "#fff", textAlign: "center", marginBottom: 18 }}>
            {p.title as string}
          </h3>
        )}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {formFields.map(field => (
            <input
              key={field.type}
              type={field.type === "email" ? "email" : "text"}
              placeholder={field.label}
              required={field.required}
              value={state.fields[field.type] ?? ""}
              onChange={e => setState(s => ({ ...s, fields: { ...s.fields, [field.type]: e.target.value } }))}
              style={{
                width: "100%", boxSizing: "border-box", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10,
                padding: "12px 13px", color: "#e7ecf3", fontSize: 14, background: "#08090d", fontFamily: "inherit",
              }}
            />
          ))}
          {state.error && <p style={{ color: "#f87171", fontSize: 12 }}>{state.error}</p>}
          <button
            type="submit"
            disabled={state.submitting}
            style={{
              background: "linear-gradient(180deg,#fb923c,#f97316)", color: "#fff", fontWeight: 700, fontSize: 15,
              padding: 13, borderRadius: 10, textAlign: "center", boxShadow: "0 8px 20px -8px rgba(249,115,22,.6)",
              border: "none", cursor: state.submitting ? "not-allowed" : "pointer", opacity: state.submitting ? 0.7 : 1,
              fontFamily: "inherit",
            }}
          >
            {state.submitting ? "Submitting…" : (p.button_text as string) || "Submit"}
          </button>
        </form>
        {Boolean(p.fine_print) && (
          <p style={{ textAlign: "center", color: "#5b6678", fontSize: 11, marginTop: 13 }}>{p.fine_print as string}</p>
        )}
      </div>
    </div>
  );
}
