"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { wsFetch } from "@/lib/workspace/client";

interface Icp {
  id: string;
  name: string;
  industry: string | null;
  company_size: string | null;
  geography: string | null;
  roles: string | null;
  pains: string[];
  goals: string[];
  triggers: string[];
  objections: string[];
  tone: string | null;
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
          <span
            key={i}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, background: "var(--app-surface-strong)", color: "var(--app-text)", padding: "4px 10px", borderRadius: 999, border: "1px solid var(--app-border)" }}
          >
            {item}
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-muted)", fontSize: 13, lineHeight: 1, padding: "0 0 0 2px" }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 13,
            color: "var(--app-text)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          onClick={add}
          style={{ background: "var(--app-surface-strong)", border: "1px solid var(--app-border)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, color: "var(--app-text)", cursor: "pointer", fontFamily: "inherit" }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--app-text)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
  display: "block",
};

const cardStyle: React.CSSProperties = {
  background: "var(--app-surface)",
  border: "1px solid var(--app-border)",
  borderRadius: 12,
  padding: 20,
};

export default function IcpEditorClient({ id }: { id: string }) {
  const router = useRouter();
  const [icp, setIcp] = useState<Icp | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");

  // Local editable state
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [geography, setGeography] = useState("");
  const [roles, setRoles] = useState("");
  const [pains, setPains] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [objections, setObjections] = useState<string[]>([]);
  const [tone, setTone] = useState("");

  useEffect(() => {
    wsFetch(`/api/playbook/icps/${id}`).then((r: Response) => r.json() as Promise<{ icp?: Icp }>).then(d => {
      if (!d.icp) return;
      const c = d.icp as Icp;
      setIcp(c);
      setName(c.name);
      setIndustry(c.industry ?? "");
      setCompanySize(c.company_size ?? "");
      setGeography(c.geography ?? "");
      setRoles(c.roles ?? "");
      setPains(c.pains ?? []);
      setGoals(c.goals ?? []);
      setTriggers(c.triggers ?? []);
      setObjections(c.objections ?? []);
      setTone(c.tone ?? "");
    });
  }, [id]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  async function save() {
    setSaving(true);
    try {
      await wsFetch(`/api/playbook/icps/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, industry: industry || null, company_size: companySize || null, geography: geography || null, roles: roles || null, pains, goals, triggers, objections, tone: tone || null }),
      });
      showToast("Saved");
    } finally { setSaving(false); }
  }

  async function deleteIcp() {
    if (!confirm("Delete this ICP? This cannot be undone.")) return;
    setDeleting(true);
    await wsFetch(`/api/playbook/icps/${id}`, { method: "DELETE" });
    router.push("/playbook");
  }

  if (!icp) {
    return <div style={{ padding: 32, color: "var(--app-text-muted)", fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div className="v2-app" style={{ color: "var(--app-text)", padding: "0 0 64px" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--app-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.push("/playbook")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-muted)", fontSize: 13, fontFamily: "inherit", padding: 0 }}>← ICPs &amp; Offers</button>
          <span style={{ color: "var(--app-border)" }}>|</span>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(167,139,250,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🎯</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ background: "none", border: "none", outline: "none", fontSize: 16, fontWeight: 700, color: "var(--app-text)", fontFamily: "inherit", minWidth: 180 }}
            onBlur={save}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {toast && <span style={{ fontSize: 12, color: "#34D399", alignSelf: "center" }}>{toast}</span>}
          <button onClick={deleteIcp} disabled={deleting} style={{ background: "none", border: "1px solid var(--app-danger)", color: "var(--app-danger)", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
          <button onClick={save} disabled={saving} style={{ background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>

        {/* Basics */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Basics</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Industry</label>
              <input style={inputStyle} value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. SaaS, Real estate, Healthcare" />
            </div>
            <div>
              <label style={labelStyle}>Company size</label>
              <input style={inputStyle} value={companySize} onChange={e => setCompanySize(e.target.value)} placeholder="e.g. 10–200 employees" />
            </div>
            <div>
              <label style={labelStyle}>Geography</label>
              <input style={inputStyle} value={geography} onChange={e => setGeography(e.target.value)} placeholder="e.g. Nigeria, West Africa, US" />
            </div>
            <div>
              <label style={labelStyle}>Job titles / roles</label>
              <input style={inputStyle} value={roles} onChange={e => setRoles(e.target.value)} placeholder="e.g. Founder, Marketing Manager" />
            </div>
          </div>
        </div>

        {/* Pains & goals */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Pains &amp; Goals</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Pain points <span style={{ color: "#A78BFA" }}>(the AI surfaces these in sequences)</span></label>
            <TagList items={pains} onChange={setPains} placeholder="e.g. Can't close deals consistently" />
          </div>
          <div>
            <label style={labelStyle}>Goals they want to achieve</label>
            <TagList items={goals} onChange={setGoals} placeholder="e.g. Book 5 calls per week" />
          </div>
        </div>

        {/* Triggers & objections */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Buying Triggers &amp; Objections</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Buying triggers <span style={{ color: "var(--app-text-muted)", textTransform: "none" }}>(events that make them ready to buy)</span></label>
            <TagList items={triggers} onChange={setTriggers} placeholder="e.g. Just raised funding, Hired new sales rep" />
          </div>
          <div>
            <label style={labelStyle}>Objections to pre-empt <span style={{ color: "var(--app-text-muted)", textTransform: "none" }}>(the AI addresses these in follow-ups)</span></label>
            <TagList items={objections} onChange={setObjections} placeholder="e.g. Too expensive, Already have a solution" />
          </div>
        </div>

        {/* Tone */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Tone &amp; Language</h3>
          <label style={labelStyle}>Voice guidance for the AI</label>
          <textarea
            value={tone}
            onChange={e => setTone(e.target.value)}
            placeholder="e.g. Peer-to-peer, Nigerian-friendly, direct but warm. Reference local business context. Avoid corporate jargon."
            style={{ ...inputStyle, minHeight: 80, resize: "vertical", lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={save} disabled={saving} style={{ background: "var(--app-accent)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save ICP"}
          </button>
        </div>
      </div>
    </div>
  );
}
