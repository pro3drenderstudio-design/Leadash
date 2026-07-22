"use client";
import { useEffect, useState, useCallback } from "react";

interface Signup {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  bank_account_name: string;
  payment_method: "bank_transfer" | "paystack";
  paystack_reference: string | null;
  status: "pending" | "confirmed" | "rejected" | "expired";
  user_id: string | null;
  workspace_id: string | null;
  amount_ngn: number | null;
  notes: string | null;
  rejection_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
}

interface Counts {
  total: number;
  pending: number;
  confirmed: number;
  rejected: number;
  confirmed_revenue_ngn: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "#f97316",
  confirmed: "#22c55e",
  rejected:  "#ef4444",
  expired:   "#6b7280",
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export default function ChallengeSignupsPage() {
  const [signups, setSignups]     = useState<Signup[]>([]);
  const [counts, setCounts]       = useState<Counts | null>(null);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [status, setStatus]       = useState("pending");
  const [search, setSearch]       = useState("");
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");
  const [page, setPage]           = useState(0);
  const [acting, setActing]       = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [rejectId, setRejectId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [toast, setToast]         = useState<string | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const fetchSignups = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    if (search) params.set("search", search);
    if (from)   params.set("from", from);
    if (to)     params.set("to", to);
    const res  = await fetch(`/api/admin/challenge-signups?${params}`);
    const data = await res.json() as { signups: Signup[]; total: number; counts: Counts };
    setSignups(data.signups ?? []);
    setTotal(data.total ?? 0);
    setCounts(data.counts ?? null);
    setLoading(false);
  }, [status, search, page, from, to]);

  useEffect(() => { void fetchSignups(); }, [fetchSignups]);

  async function act(id: string, body: Record<string, unknown>, okMsg: string) {
    setActing(id);
    const res = await fetch(`/api/admin/challenge-signups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setActing(null);
    if (res.ok) { flash(okMsg); await fetchSignups(); }
    else { const d = await res.json().catch(() => ({})); flash(d.error ?? "Action failed"); }
  }

  const fmt = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const ngn = (n: number) => "₦" + n.toLocaleString("en-NG");

  const preset = (f: string, t: string) => { setFrom(f); setTo(t); setPage(0); };

  const cardStyle: React.CSSProperties = { background: "#0f0f0f", border: "1px solid #1f1f1f", borderRadius: 10, padding: "14px 18px", flex: 1, minWidth: 130 };

  return (
    <div style={{ padding: 32, maxWidth: 1180, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#e5e5e5" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Challenge Signups</h1>
        <p style={{ margin: "4px 0 0", color: "#888", fontSize: 13 }}>
          Verify payments, confirm access, and manage every challenge registrant.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          { label: "Total signups", value: counts?.total ?? 0, color: "#e5e5e5", tab: "all" },
          { label: "Pending", value: counts?.pending ?? 0, color: "#f97316", tab: "pending" },
          { label: "Confirmed", value: counts?.confirmed ?? 0, color: "#22c55e", tab: "confirmed" },
          { label: "Rejected", value: counts?.rejected ?? 0, color: "#ef4444", tab: "rejected" },
        ].map(c => (
          <button key={c.label} onClick={() => { setStatus(c.tab); setPage(0); }}
            style={{ ...cardStyle, cursor: "pointer", textAlign: "left", borderColor: status === c.tab ? c.color + "66" : "#1f1f1f", background: status === c.tab ? c.color + "12" : "#0f0f0f" }}>
            <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: c.color, fontVariantNumeric: "tabular-nums" }}>{c.value.toLocaleString()}</div>
          </button>
        ))}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Confirmed revenue</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e", fontVariantNumeric: "tabular-nums" }}>{ngn(counts?.confirmed_revenue_ngn ?? 0)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search name, email, phone..."
          style={{ flex: 1, minWidth: 200, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 13 }} />
        {(["pending", "confirmed", "rejected", "all"] as const).map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(0); }}
            style={{ background: status === s ? "#f97316" : "#1a1a1a", color: status === s ? "#fff" : "#aaa", border: `1px solid ${status === s ? "#f97316" : "#2a2a2a"}`, borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>
            {s}
          </button>
        ))}
      </div>

      {/* Date range */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center", fontSize: 12, color: "#888" }}>
        <span>Date:</span>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 10px", color: "#e5e5e5", fontSize: 12 }} />
        <span>→</span>
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 10px", color: "#e5e5e5", fontSize: 12 }} />
        {[
          { label: "Today", f: todayStr(), t: todayStr() },
          { label: "7d",    f: daysAgoStr(7), t: todayStr() },
          { label: "30d",   f: daysAgoStr(30), t: todayStr() },
        ].map(p => (
          <button key={p.label} onClick={() => preset(p.f, p.t)} style={{ background: from === p.f && to === p.t ? "#2a2a2a" : "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 12px", color: "#aaa", cursor: "pointer", fontSize: 12 }}>{p.label}</button>
        ))}
        {(from || to) && <button onClick={() => { setFrom(""); setTo(""); setPage(0); }} style={{ background: "transparent", border: "none", color: "#f97316", cursor: "pointer", fontSize: 12 }}>Clear</button>}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: "#666", padding: 20 }}>Loading...</div>
      ) : signups.length === 0 ? (
        <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 40, textAlign: "center", color: "#666" }}>No signups match these filters.</div>
      ) : (
        <div style={{ background: "#0f0f0f", border: "1px solid #1f1f1f", borderRadius: 8, overflow: "hidden" }}>
          {signups.map((s, i) => {
            const waPhone = (s.phone || "").replace(/\D/g, "");
            return (
            <div key={s.id}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 150px 110px", gap: 12, padding: "14px 20px", borderBottom: "1px solid #1a1a1a", alignItems: "center", cursor: "pointer", background: expanded === s.id ? "#1a1a1a" : i % 2 === 0 ? "#0f0f0f" : "#111" }}
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{s.full_name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{s.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#ccc" }}>{s.bank_account_name || "—"}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{s.payment_method === "bank_transfer" ? "🏦 Bank transfer" : "💳 Paystack"}{s.amount_ngn ? ` · ${ngn(s.amount_ngn)}` : ""}</div>
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>{fmt(s.created_at)}</div>
                <div>
                  <span style={{ background: STATUS_COLORS[s.status] + "22", color: STATUS_COLORS[s.status], border: `1px solid ${STATUS_COLORS[s.status]}44`, borderRadius: 4, padding: "2px 8px", fontSize: 11, textTransform: "capitalize" }}>{s.status}</span>
                </div>
              </div>

              {expanded === s.id && (
                <div style={{ padding: "16px 20px 20px", background: "#141414", borderBottom: "1px solid #1a1a1a" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 14 }}>
                    {[
                      { label: "Phone / WhatsApp", value: s.phone || "—" },
                      { label: "Amount", value: s.amount_ngn ? ngn(s.amount_ngn) : "—" },
                      { label: "Paystack ref", value: s.paystack_reference ?? "—" },
                      { label: "Account", value: s.user_id ? "Linked ✓" : "No account yet" },
                      { label: "Confirmed", value: s.confirmed_at ? fmt(s.confirmed_at) : "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                        <div style={{ fontSize: 13, color: "#ccc" }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {s.rejection_reason && <div style={{ background: "#2d1414", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#f87171", marginBottom: 10 }}>Rejection reason: {s.rejection_reason}</div>}
                  {s.notes && <div style={{ background: "#1a1a1a", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#aaa", marginBottom: 10 }}>Note: {s.notes}</div>}

                  {/* Action bar */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.status === "pending" && (
                      <>
                        <button onClick={() => act(s.id, { action: "confirm" }, "Confirmed ✓")} disabled={acting === s.id}
                          style={{ background: "#14532d", border: "1px solid #22c55e", borderRadius: 6, padding: "7px 14px", color: "#22c55e", cursor: "pointer", fontSize: 12.5, opacity: acting === s.id ? 0.6 : 1 }}>
                          {acting === s.id ? "…" : "✓ Confirm payment"}
                        </button>
                        <button onClick={() => setRejectId(s.id)} style={{ background: "#2d1414", border: "1px solid #ef4444", borderRadius: 6, padding: "7px 14px", color: "#ef4444", cursor: "pointer", fontSize: 12.5 }}>✕ Reject</button>
                      </>
                    )}
                    {s.status === "confirmed" && (
                      <button onClick={() => act(s.id, { action: "resend_email" }, "Access email resent 📧")} disabled={acting === s.id}
                        style={{ background: "#1e293b", border: "1px solid #f97316", borderRadius: 6, padding: "7px 14px", color: "#f97316", cursor: "pointer", fontSize: 12.5, opacity: acting === s.id ? 0.6 : 1 }}>
                        {acting === s.id ? "…" : "📧 Resend access email"}
                      </button>
                    )}
                    {s.user_id && (
                      <a href={`/admin/users/${s.user_id}`} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "7px 14px", color: "#ccc", textDecoration: "none", fontSize: 12.5 }}>👤 View user / workspace</a>
                    )}
                    {waPhone && (
                      <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hi ${s.full_name.split(" ")[0]}, this is Leadash Academy regarding your 7-Day Challenge signup.`)}`} target="_blank" rel="noreferrer"
                        style={{ background: "#0d2d1a", border: "1px solid #25d36644", borderRadius: 6, padding: "7px 14px", color: "#25d366", textDecoration: "none", fontSize: 12.5 }}>💬 WhatsApp</a>
                    )}
                    <button onClick={() => { navigator.clipboard.writeText(s.email); flash("Email copied"); }} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "7px 14px", color: "#aaa", cursor: "pointer", fontSize: 12.5 }}>Copy email</button>
                    {s.phone && <button onClick={() => { navigator.clipboard.writeText(s.phone); flash("Phone copied"); }} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "7px 14px", color: "#aaa", cursor: "pointer", fontSize: 12.5 }}>Copy phone</button>}
                    {s.paystack_reference && <button onClick={() => { navigator.clipboard.writeText(s.paystack_reference!); flash("Reference copied"); }} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "7px 14px", color: "#aaa", cursor: "pointer", fontSize: 12.5 }}>Copy ref</button>}
                  </div>
                </div>
              )}
            </div>
          );})}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 16px", color: "#aaa", cursor: "pointer" }}>←</button>
          <span style={{ padding: "6px 12px", fontSize: 13, color: "#888" }}>Page {page + 1} of {Math.ceil(total / 50)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= total} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 16px", color: "#aaa", cursor: "pointer" }}>→</button>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: 28, width: 420, maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#ef4444" }}>Reject Signup</h3>
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6 }}>Reason (optional)</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="e.g. Payment not found, wrong amount..."
              style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 13, boxSizing: "border-box", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => { setRejectId(null); setRejectReason(""); }} style={{ background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 16px", color: "#aaa", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={() => { const id = rejectId; setRejectId(null); act(id, { action: "reject", rejection_reason: rejectReason }, "Rejected"); setRejectReason(""); }}
                style={{ background: "#2d1414", border: "1px solid #ef4444", borderRadius: 6, padding: "8px 20px", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>Reject Signup</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#22c55e", color: "#04140a", fontWeight: 700, fontSize: 13, padding: "10px 22px", borderRadius: 999, zIndex: 100, boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>{toast}</div>
      )}
    </div>
  );
}
