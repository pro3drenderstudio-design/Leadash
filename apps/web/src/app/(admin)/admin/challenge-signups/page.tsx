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
  notes: string | null;
  rejection_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "#f97316",
  confirmed: "#22c55e",
  rejected:  "#ef4444",
  expired:   "#6b7280",
};

export default function ChallengeSignupsPage() {
  const [signups, setSignups]     = useState<Signup[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [status, setStatus]       = useState("pending");
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(0);
  const [acting, setActing]       = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [rejectId, setRejectId]   = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchSignups = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    if (search) params.set("search", search);
    const res  = await fetch(`/api/admin/challenge-signups?${params}`);
    const data = await res.json() as { signups: Signup[]; total: number };
    setSignups(data.signups ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [status, search, page]);

  useEffect(() => { void fetchSignups(); }, [fetchSignups]);

  async function confirm(id: string) {
    setActing(id);
    await fetch(`/api/admin/challenge-signups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    });
    setActing(null);
    await fetchSignups();
  }

  async function reject(id: string) {
    setActing(id);
    await fetch(`/api/admin/challenge-signups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", rejection_reason: rejectReason }),
    });
    setActing(null);
    setRejectId(null);
    setRejectReason("");
    await fetchSignups();
  }

  const fmt = (d: string) => new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });

  const pendingCount = status === "pending" ? total : null;

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, sans-serif", color: "#e5e5e5" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Challenge Signups</h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 13 }}>
            Bank transfer payment queue — confirm or reject after verifying payment.
          </p>
        </div>
        {pendingCount !== null && pendingCount > 0 && (
          <div style={{ background: "#f97316", color: "#fff", borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 600 }}>
            {pendingCount} pending
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search name, email, phone..."
          style={{ flex: 1, minWidth: 200, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 13 }}
        />
        {(["pending", "confirmed", "rejected", "all"] as const).map(s => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(0); }}
            style={{
              background: status === s ? "#f97316" : "#1a1a1a",
              color:      status === s ? "#fff" : "#aaa",
              border:     `1px solid ${status === s ? "#f97316" : "#2a2a2a"}`,
              borderRadius: 6, padding: "8px 16px", fontSize: 13, cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: "#666", padding: 20 }}>Loading...</div>
      ) : signups.length === 0 ? (
        <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 40, textAlign: "center", color: "#666" }}>
          No {status} signups found.
        </div>
      ) : (
        <div style={{ background: "#0f0f0f", border: "1px solid #1f1f1f", borderRadius: 8, overflow: "hidden" }}>
          {signups.map((s, i) => (
            <div key={s.id}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 140px 100px 120px",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: "1px solid #1a1a1a",
                  alignItems: "center",
                  cursor: "pointer",
                  background: expanded === s.id ? "#1a1a1a" : i % 2 === 0 ? "#0f0f0f" : "#111",
                }}
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{s.full_name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{s.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: "#ccc" }}>{s.bank_account_name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {s.payment_method === "bank_transfer" ? "🏦 Bank transfer" : "💳 Paystack"}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>{fmt(s.created_at)}</div>
                <div>
                  <span style={{
                    background: STATUS_COLORS[s.status] + "22",
                    color:      STATUS_COLORS[s.status],
                    border:     `1px solid ${STATUS_COLORS[s.status]}44`,
                    borderRadius: 4, padding: "2px 8px", fontSize: 11, textTransform: "capitalize",
                  }}>
                    {s.status}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                  {s.status === "pending" && (
                    <>
                      <button
                        onClick={() => confirm(s.id)}
                        disabled={acting === s.id}
                        style={{ background: "#14532d", border: "1px solid #22c55e", borderRadius: 5, padding: "5px 10px", color: "#22c55e", cursor: "pointer", fontSize: 12, opacity: acting === s.id ? 0.6 : 1 }}
                      >
                        {acting === s.id ? "..." : "✓ Confirm"}
                      </button>
                      <button
                        onClick={() => setRejectId(s.id)}
                        style={{ background: "#2d1414", border: "1px solid #ef4444", borderRadius: 5, padding: "5px 10px", color: "#ef4444", cursor: "pointer", fontSize: 12 }}
                      >
                        ✕ Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === s.id && (
                <div style={{ padding: "16px 20px 20px", background: "#141414", borderBottom: "1px solid #1a1a1a" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 12 }}>
                    {[
                      { label: "Phone / WhatsApp", value: s.phone },
                      { label: "Payment method",   value: s.payment_method === "bank_transfer" ? "Bank Transfer" : "Paystack" },
                      { label: "Paystack ref",     value: s.paystack_reference ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                        <div style={{ fontSize: 13, color: "#ccc" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {s.rejection_reason && (
                    <div style={{ background: "#2d1414", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#f87171", marginBottom: 8 }}>
                      Rejection reason: {s.rejection_reason}
                    </div>
                  )}
                  {s.notes && (
                    <div style={{ background: "#1a1a1a", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#aaa" }}>
                      Note: {s.notes}
                    </div>
                  )}
                  {s.confirmed_at && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                      Confirmed at: {fmt(s.confirmed_at)}
                    </div>
                  )}
                  {/* WhatsApp verification link */}
                  {s.status === "pending" && (
                    <a
                      href={`https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${s.full_name}, we've received your challenge signup. Can you confirm your payment name was: ${s.bank_account_name}?`)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: "#25d366", textDecoration: "none", background: "#0d2d1a", border: "1px solid #25d36644", borderRadius: 5, padding: "5px 12px" }}
                    >
                      💬 Message on WhatsApp
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
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
            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6 }}>Reason (optional — sent to community manager)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Payment not found, wrong amount..."
              style={{ width: "100%", background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 12px", color: "#e5e5e5", fontSize: 13, boxSizing: "border-box", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => { setRejectId(null); setRejectReason(""); }} style={{ background: "#111", border: "1px solid #333", borderRadius: 6, padding: "8px 16px", color: "#aaa", cursor: "pointer", fontSize: 13 }}>Cancel</button>
              <button onClick={() => reject(rejectId)} style={{ background: "#2d1414", border: "1px solid #ef4444", borderRadius: 6, padding: "8px 20px", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>Reject Signup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
