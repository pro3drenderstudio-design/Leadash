"use client";
import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Inbox {
  id:            string;
  email_address: string;
  status:        string;
}

interface OrderDetail {
  id:          string;
  domain:      string;
  workspace_id: string;
  status:      string;
  inboxes:     Inbox[];
}

interface InboxCred {
  id:       string;
  email:    string;
  password: string;
}

// ── CSV helpers ─────────────────────────────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const cells = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function downloadCsvTemplate(domain: string, inboxes: Inbox[]) {
  const header = "inbox_id,email_address,domain,password,verification_txt,dkim_sel1_cname_target,dkim_sel2_cname_target";
  const rows   = inboxes.map(i =>
    `"${i.id}","${i.email_address}","${domain}","","",""`,
  );
  const blob = new Blob([[header, ...rows].join("\r\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `order-${domain}-inboxes.csv`; a.click();
  URL.revokeObjectURL(url);
}

function Step({ n, label, done }: { n: number; label: string; done?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: done ? "#16a34a" : "#0f172a",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done
          ? <svg width="14" height="14" viewBox="0 0 20 20" fill="white"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
          : <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{n}</span>
        }
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{label}</span>
    </div>
  );
}

export default function VendorOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router  = useRouter();

  const [order,   setOrder]   = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [verificationTxt, setVerificationTxt] = useState("");
  const [dkimSel1Target,  setDkimSel1Target]  = useState("");
  const [dkimSel2Target,  setDkimSel2Target]  = useState("");
  const [creds,           setCreds]           = useState<InboxCred[]>([]);
  const [csvUploaded,     setCsvUploaded]     = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result,     setResult]     = useState<{ passed: number; failed: number; details: string[] } | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/vendor/orders/${id}`);
        if (res.status === 401) { router.push("/vendor/login"); return; }
        if (!res.ok) { setError("Order not found"); return; }
        const data: OrderDetail = await res.json() as OrderDetail;
        setOrder(data);
        setCreds(data.inboxes.map(inbox => ({ id: inbox.id, email: inbox.email_address, password: "" })));
      } catch {
        setError("Failed to load order");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) { setError("CSV appears empty — check format"); return; }

      // Tenant fields from first data row
      const first = rows[0];
      if (first.verification_txt)        setVerificationTxt(first.verification_txt);
      if (first.dkim_sel1_cname_target)  setDkimSel1Target(first.dkim_sel1_cname_target);
      if (first.dkim_sel2_cname_target)  setDkimSel2Target(first.dkim_sel2_cname_target);

      // Per-inbox passwords — match by inbox_id or email_address
      setCreds(prev => prev.map(cred => {
        const row = rows.find(r => r.inbox_id === cred.id || r.email_address === cred.email);
        return row?.password ? { ...cred, password: row.password } : cred;
      }));

      setCsvUploaded(true);
      setError("");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const emptyPasswords = creds.filter(c => !c.password.trim());
    if (emptyPasswords.length > 0) {
      setError(`Missing password for: ${emptyPasswords.map(c => c.email).join(", ")}`);
      return;
    }
    if (!verificationTxt.trim() || !dkimSel1Target.trim() || !dkimSel2Target.trim()) {
      setError("All three Microsoft tenant DNS fields are required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/vendor/orders/${id}/provision`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ verificationTxt, dkimSel1Target, dkimSel2Target, creds }),
      });
      const data = await res.json() as { error?: string; passed?: number; failed?: number; details?: string[] };
      if (!res.ok) { setError(data.error ?? "Provision failed"); return; }
      setResult({ passed: data.passed ?? 0, failed: data.failed ?? 0, details: data.details ?? [] });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748b", padding: 40 }}>
      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="#e2e8f0" strokeWidth="3"/>
        <path d="M12 2a10 10 0 0110 10" stroke="#0f172a" strokeWidth="3" strokeLinecap="round"/>
      </svg>
      Loading order…
    </div>
  );
  if (error && !order) return (
    <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, color: "#991b1b", fontSize: 14 }}>{error}</div>
  );
  if (!order) return null;

  // Result screen
  if (result) {
    const allPassed = result.failed === 0;
    return (
      <div>
        <Link href="/vendor/orders" style={{ fontSize: 13, color: "#64748b", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 20 }}>
          ← Back to Orders
        </Link>
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{
            background: allPassed ? "#f0fdf4" : "#fff7ed",
            borderBottom: `1px solid ${allPassed ? "#86efac" : "#fed7aa"}`,
            padding: "24px 28px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: allPassed ? "#16a34a" : "#f97316",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {allPassed
                  ? <svg width="22" height="22" viewBox="0 0 20 20" fill="white"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  : <svg width="22" height="22" viewBox="0 0 20 20" fill="white"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                }
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: "#0f172a" }}>
                  {allPassed ? "All inboxes activated!" : `${result.passed} activated, ${result.failed} failed`}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{order.domain}</div>
              </div>
            </div>
          </div>
          <div style={{ padding: "20px 28px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Results:</div>
            <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: 13, lineHeight: 2, color: "#374151" }}>
              {result.details.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
            <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
              <button
                onClick={() => router.push("/vendor/orders")}
                style={{ background: "#0f172a", color: "#fff", padding: "10px 20px", borderRadius: 9, border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                ← Back to Orders
              </button>
              <button
                onClick={() => router.push("/vendor")}
                style={{ background: "#f8fafc", color: "#475569", padding: "10px 20px", borderRadius: 9, border: "1px solid #e2e8f0", fontWeight: 500, fontSize: 13, cursor: "pointer" }}
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const allCredsProvided  = creds.every(c => c.password.trim());
  const allTenantProvided = verificationTxt.trim() && dkimSel1Target.trim() && dkimSel2Target.trim();

  return (
    <div>
      {/* Back + header */}
      <Link href="/vendor/orders" style={{ fontSize: 13, color: "#64748b", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16 }}>
        ← Back to Orders
      </Link>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.4px" }}>
          {order.domain}
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          {order.inboxes.length} inbox{order.inboxes.length !== 1 ? "es" : ""} · Microsoft 365 provisioning
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Step 1: Download template ─────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 16 }}>
          <Step n={1} label="Download the inbox template CSV" />
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px 38px" }}>
            Download the CSV with all inbox email addresses pre-filled. Add the M365 tenant DNS values and passwords for each inbox, then upload in Step 2.
          </p>
          <div style={{ marginLeft: 38 }}>
            <button
              type="button"
              onClick={() => downloadCsvTemplate(order.domain, order.inboxes)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "#f8fafc", color: "#0f172a", border: "1.5px solid #e2e8f0",
                padding: "9px 18px", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
              Download Template CSV
            </button>
            <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
              Columns: inbox_id · email_address · domain · <strong>password</strong> · <strong>verification_txt</strong> · <strong>dkim_sel1_cname_target</strong> · <strong>dkim_sel2_cname_target</strong>
            </div>
          </div>
        </div>

        {/* ── Step 2: Upload completed CSV ──────────────────── */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 16 }}>
          <Step n={2} label="Upload completed CSV" done={csvUploaded} />
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px 38px" }}>
            Fill in the CSV with passwords and tenant DNS values, then upload it here to auto-populate the form below.
          </p>
          <div style={{ marginLeft: 38 }}>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleCsvUpload} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: csvUploaded ? "#f0fdf4" : "#f8fafc",
                color: csvUploaded ? "#166534" : "#0f172a",
                border: `1.5px solid ${csvUploaded ? "#86efac" : "#e2e8f0"}`,
                padding: "9px 18px", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}
            >
              {csvUploaded ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                  CSV Uploaded
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd"/>
                  </svg>
                  Upload CSV
                </>
              )}
            </button>
            {csvUploaded && (
              <button type="button" onClick={() => fileRef.current?.click()}
                style={{ marginLeft: 10, fontSize: 12, color: "#64748b", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                Replace
              </button>
            )}
          </div>
        </div>

        {/* ── Step 3: Review & confirm ──────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: 16 }}>
          <Step n={3} label="Review and submit" done={allCredsProvided && !!allTenantProvided} />

          {/* Tenant DNS */}
          <div style={{ marginLeft: 38 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>Microsoft Tenant DNS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Domain Verification TXT", value: verificationTxt, set: setVerificationTxt, ph: "MS=ms12345678" },
                { label: "DKIM Selector1 CNAME Target", value: dkimSel1Target, set: setDkimSel1Target, ph: "selector1-domain._domainkey.tenant.onmicrosoft.com" },
                { label: "DKIM Selector2 CNAME Target", value: dkimSel2Target, set: setDkimSel2Target, ph: "selector2-domain._domainkey.tenant.onmicrosoft.com" },
              ].map(field => (
                <div key={field.label}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value={field.value}
                    onChange={e => field.set(e.target.value)}
                    placeholder={field.ph}
                    required
                    style={{
                      width: "100%", padding: "9px 12px", borderRadius: 8,
                      border: "1.5px solid #e2e8f0", fontSize: 13,
                      fontFamily: "monospace", boxSizing: "border-box",
                      background: field.value ? "#f8fafc" : "#fff",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Per-inbox passwords */}
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>Inbox Credentials</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {creds.map((cred, i) => (
                <div key={cred.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "#f8fafc", borderRadius: 9, padding: "10px 14px",
                  border: "1px solid #e2e8f0",
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: cred.password ? "#16a34a" : "#d1d5db",
                  }} />
                  <span style={{ fontSize: 13, color: "#374151", flex: 1, fontFamily: "monospace", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {cred.email}
                  </span>
                  <input
                    type="text"
                    value={cred.password}
                    onChange={e => {
                      const next = [...creds];
                      next[i] = { ...next[i], password: e.target.value };
                      setCreds(next);
                    }}
                    placeholder="Password"
                    style={{
                      width: 200, padding: "7px 10px", borderRadius: 8,
                      border: `1.5px solid ${cred.password ? "#86efac" : "#e2e8f0"}`,
                      fontSize: 13, fontFamily: "monospace", flexShrink: 0,
                      background: cred.password ? "#f0fdf4" : "#fff",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 9, padding: "12px 16px", fontSize: 13, color: "#991b1b", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            background: "#0f172a", color: "#fff", padding: "13px 32px",
            borderRadius: 10, border: "none", fontWeight: 700, fontSize: 15,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          {submitting && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
              <path d="M12 2a10 10 0 0110 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
            </svg>
          )}
          {submitting ? "Provisioning & testing SMTP connections…" : "Provision Inboxes"}
        </button>
      </form>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
