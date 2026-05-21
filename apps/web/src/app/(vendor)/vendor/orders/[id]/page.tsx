"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

interface Inbox {
  id:            string;
  email_address: string;
  status:        string;
}

interface OrderDetail {
  id:          string;
  domain:      string;
  workspace_id: string;
  inboxes:     Inbox[];
}

interface InboxCred {
  id:       string;
  email:    string;
  password: string;
}

export default function VendorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const [order,   setOrder]   = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Tenant fields
  const [verificationTxt, setVerificationTxt] = useState("");
  const [dkimSel1Target,  setDkimSel1Target]  = useState("");
  const [dkimSel2Target,  setDkimSel2Target]  = useState("");

  // Per-inbox passwords
  const [creds, setCreds] = useState<InboxCred[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState<{ passed: number; failed: number; details: string[] } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/vendor/orders/${id}`);
        if (!res.ok) { setError("Order not found"); return; }
        const data: OrderDetail = await res.json();
        setOrder(data);
        setCreds(data.inboxes.map(inbox => ({ id: inbox.id, email: inbox.email_address, password: "" })));
      } catch {
        setError("Failed to load order");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vendor/orders/${id}/provision`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ verificationTxt, dkimSel1Target, dkimSel2Target, creds }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Provision failed"); return; }
      setResult(data);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p style={{ color: "#6b7280" }}>Loading…</p>;
  if (error && !order) return <p style={{ color: "#ef4444" }}>{error}</p>;
  if (!order) return null;

  if (result) {
    return (
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Provisioning Complete — {order.domain}</h1>
        <div style={{ background: result.failed === 0 ? "#f0fdf4" : "#fef2f2", border: `1px solid ${result.failed === 0 ? "#86efac" : "#fca5a5"}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <p style={{ fontWeight: 700, color: result.failed === 0 ? "#15803d" : "#b91c1c", margin: 0 }}>
            {result.passed} inbox{result.passed !== 1 ? "es" : ""} activated, {result.failed} failed
          </p>
          {result.details.length > 0 && (
            <ul style={{ marginTop: 10, paddingLeft: 20, fontSize: 13, color: "#374151" }}>
              {result.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
        <button onClick={() => router.push("/vendor")} style={{ background: "#111", color: "#fff", padding: "10px 20px", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Provision — {order.domain}</h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>{order.inboxes.length} inbox{order.inboxes.length !== 1 ? "es" : ""}</p>

      <form onSubmit={handleSubmit}>
        {/* Tenant DNS fields */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Microsoft Tenant DNS</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", color: "#374151", fontWeight: 600, marginBottom: 4 }}>Domain Verification TXT</span>
              <input
                type="text"
                value={verificationTxt}
                onChange={e => setVerificationTxt(e.target.value)}
                placeholder="MS=ms12345678"
                required
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", color: "#374151", fontWeight: 600, marginBottom: 4 }}>DKIM Selector1 CNAME Target</span>
              <input
                type="text"
                value={dkimSel1Target}
                onChange={e => setDkimSel1Target(e.target.value)}
                placeholder="selector1-yourdomain-com._domainkey.yourtenantdomain.onmicrosoft.com"
                required
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ display: "block", color: "#374151", fontWeight: 600, marginBottom: 4 }}>DKIM Selector2 CNAME Target</span>
              <input
                type="text"
                value={dkimSel2Target}
                onChange={e => setDkimSel2Target(e.target.value)}
                placeholder="selector2-yourdomain-com._domainkey.yourtenantdomain.onmicrosoft.com"
                required
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box" }}
              />
            </label>
          </div>
        </section>

        {/* Per-inbox passwords */}
        <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Inbox Credentials</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {creds.map((cred, i) => (
              <div key={cred.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 14, color: "#374151", flex: 1, fontFamily: "monospace" }}>{cred.email}</span>
                <input
                  type="password"
                  value={cred.password}
                  onChange={e => {
                    const next = [...creds];
                    next[i] = { ...next[i], password: e.target.value };
                    setCreds(next);
                  }}
                  placeholder="Password"
                  required
                  style={{ width: 220, padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
                />
              </div>
            ))}
          </div>
        </section>

        {error && <p style={{ color: "#ef4444", fontSize: 14, marginBottom: 14 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{ background: "#111", color: "#fff", padding: "12px 28px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 15, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "Provisioning & testing SMTP…" : "Provision Inboxes"}
        </button>
      </form>
    </div>
  );
}
