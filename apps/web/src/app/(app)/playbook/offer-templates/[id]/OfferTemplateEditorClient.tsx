"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { wsFetch } from "@/lib/workspace/client";

interface OfferTemplate {
  id: string;
  name: string;
  price_label: string | null;
  what: string | null;
  value_prop: string | null;
  proof: string | null;
  guarantee: string | null;
  case_snippets: string[];
  cta_kind: "book_call" | "reply" | "link";
  cta_label: string | null;
  linked_checkout_offer_id: string | null;
}

function TagList({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft("");
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {items.map((item, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, background: "var(--app-surface-strong)", color: "var(--app-text)", padding: "4px 10px", borderRadius: 999, border: "1px solid var(--app-border)" }}>
            {item}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-muted)", fontSize: 13, lineHeight: 1, padding: "0 0 0 2px" }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder}
          style={{ flex: 1, background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "var(--app-text)", fontFamily: "inherit", outline: "none" }} />
        <button onClick={add} style={{ background: "var(--app-surface-strong)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "var(--app-text)", cursor: "pointer", fontFamily: "inherit" }}>+ Add</button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--app-text)", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--app-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" };
const cardStyle: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 12, padding: 20 };

const CTA_OPTIONS = [
  { value: "book_call", label: "Book a call", desc: "Link to a calendar or booking page" },
  { value: "reply", label: "Ask for a reply", desc: "Prompt them to respond with interest" },
  { value: "link", label: "Send a link", desc: "Direct them to a page or checkout" },
] as const;

export default function OfferTemplateEditorClient({ id }: { id: string }) {
  const router = useRouter();
  const [offer, setOffer] = useState<OfferTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [name, setName] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [what, setWhat] = useState("");
  const [valueProp, setValueProp] = useState("");
  const [proof, setProof] = useState("");
  const [guarantee, setGuarantee] = useState("");
  const [caseSnippets, setCaseSnippets] = useState<string[]>([]);
  const [ctaKind, setCtaKind] = useState<"book_call" | "reply" | "link">("book_call");
  const [ctaLabel, setCtaLabel] = useState("");

  useEffect(() => {
    wsFetch(`/api/playbook/offer-templates/${id}`).then((r: Response) => r.json() as Promise<{ offer_template?: OfferTemplate }>).then(d => {
      if (!d.offer_template) return;
      const o = d.offer_template as OfferTemplate;
      setOffer(o);
      setName(o.name);
      setPriceLabel(o.price_label ?? "");
      setWhat(o.what ?? "");
      setValueProp(o.value_prop ?? "");
      setProof(o.proof ?? "");
      setGuarantee(o.guarantee ?? "");
      setCaseSnippets(o.case_snippets ?? []);
      setCtaKind(o.cta_kind ?? "book_call");
      setCtaLabel(o.cta_label ?? "");
    });
  }, [id]);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); }, []);

  async function save() {
    setSaving(true);
    try {
      await wsFetch(`/api/playbook/offer-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, price_label: priceLabel || null, what: what || null, value_prop: valueProp || null, proof: proof || null, guarantee: guarantee || null, case_snippets: caseSnippets, cta_kind: ctaKind, cta_label: ctaLabel || null }),
      });
      showToast("Saved");
    } finally { setSaving(false); }
  }

  async function deleteOffer() {
    if (!confirm("Delete this offer template?")) return;
    await wsFetch(`/api/playbook/offer-templates/${id}`, { method: "DELETE" });
    router.push("/playbook");
  }

  if (!offer) return <div style={{ padding: 32, color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>;

  return (
    <div className="v2-app" style={{ color: "var(--app-text)", padding: "0 0 64px" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.push("/playbook")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-muted)", fontSize: 13, fontFamily: "inherit", padding: 0 }}>← ICPs &amp; Offers</button>
          <span style={{ color: "var(--app-border)" }}>|</span>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(249,115,22,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>💼</div>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={save}
            style={{ background: "none", border: "none", outline: "none", fontSize: 16, fontWeight: 700, color: "var(--app-text)", fontFamily: "inherit", minWidth: 180 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {toast && <span style={{ fontSize: 12, color: "#34D399", alignSelf: "center" }}>{toast}</span>}
          <button onClick={deleteOffer} style={{ background: "none", border: "1px solid var(--app-danger)", color: "var(--app-danger)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
          <button onClick={save} disabled={saving} style={{ background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>

        {/* The offer */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>The Offer</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Price / packaging</label>
              <input style={inputStyle} value={priceLabel} onChange={e => setPriceLabel(e.target.value)} placeholder="e.g. ₦150,000/mo, $1,500 flat" />
            </div>
            <div>
              <label style={labelStyle}>What it is</label>
              <input style={inputStyle} value={what} onChange={e => setWhat(e.target.value)} placeholder="e.g. Done-for-you cold outreach" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>One-line value proposition</label>
            <input style={inputStyle} value={valueProp} onChange={e => setValueProp(e.target.value)} placeholder="e.g. We book 5+ qualified calls every month or you don't pay" />
          </div>
        </div>

        {/* Proof & risk reversal */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Proof &amp; Risk Reversal</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Results / social proof</label>
            <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical", lineHeight: 1.5 }} value={proof} onChange={e => setProof(e.target.value)}
              placeholder="e.g. Helped 40+ Nigerian founders book their first enterprise client" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Guarantee <span style={{ color: "var(--app-text-muted)", textTransform: "none" }}>(optional)</span></label>
            <input style={inputStyle} value={guarantee} onChange={e => setGuarantee(e.target.value)} placeholder="e.g. 30-day money-back if no qualified calls booked" />
          </div>
          <div>
            <label style={labelStyle}>Case study snippets <span style={{ color: "var(--app-text-muted)", textTransform: "none" }}>(the AI drops these into emails)</span></label>
            <TagList items={caseSnippets} onChange={setCaseSnippets} placeholder="e.g. Closed ₦2M deal in 3 weeks" />
          </div>
        </div>

        {/* CTA */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Call to Action</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            {CTA_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCtaKind(opt.value)}
                style={{
                  padding: "12px 10px",
                  borderRadius: 10,
                  border: `1.5px solid ${ctaKind === opt.value ? "var(--app-accent)" : "var(--app-border)"}`,
                  background: ctaKind === opt.value ? "rgba(249,115,22,0.08)" : "var(--app-surface)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: ctaKind === opt.value ? "var(--app-accent)" : "var(--app-text)", marginBottom: 3 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: "var(--app-text-muted)", lineHeight: 1.4 }}>{opt.desc}</div>
              </button>
            ))}
          </div>
          <div>
            <label style={labelStyle}>CTA text <span style={{ color: "var(--app-text-muted)", textTransform: "none" }}>(optional — AI uses this as the call-to-action line)</span></label>
            <input style={inputStyle} value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder={ctaKind === "book_call" ? "e.g. Book a 15-min call here" : ctaKind === "reply" ? "e.g. Would this be relevant to you?" : "e.g. See how it works →"} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={save} disabled={saving} style={{ background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save Offer Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
