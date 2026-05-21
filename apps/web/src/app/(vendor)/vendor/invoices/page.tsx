export const metadata = { title: "Invoices — Leadash Vendor Portal" };

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";

async function checkAuth() {
  const jar      = await cookies();
  const token    = jar.get("vendor_token")?.value;
  const expected = process.env.VENDOR_PORTAL_SECRET;
  if (!expected || token !== expected) redirect("/vendor/login");
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#fef9c3", color: "#92400e", label: "Pending" },
  sent:    { bg: "#dbeafe", color: "#1d4ed8", label: "Sent"    },
  paid:    { bg: "#dcfce7", color: "#166534", label: "Paid"    },
  void:    { bg: "#f1f5f9", color: "#94a3b8", label: "Void"    },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "#f1f5f9", color: "#475569", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      padding: "3px 10px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      {s.label}
    </span>
  );
}

interface Invoice {
  id:                  string;
  invoice_number:      string;
  invoice_date:        string;
  inbox_count:         number;
  cost_per_inbox_usd:  number;
  total_usd:           number;
  status:              string;
  paypal_payment_id:   string | null;
  paypal_payment_url:  string | null;
  notes:               string | null;
  created_at:          string;
}

export default async function VendorInvoicesPage() {
  await checkAuth();
  const db = createAdminClient();

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [invoicesRes, monthPaidRes, pendingCountRes] = await Promise.all([
    db.from("vendor_invoices").select("*").order("invoice_date", { ascending: false }).limit(100),
    db.from("vendor_invoices").select("total_usd").eq("status", "paid").gte("invoice_date", monthStart),
    db.from("vendor_invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const invoices: Invoice[]  = invoicesRes.data ?? [];
  const monthPaid  = (monthPaidRes.data ?? []).reduce((s: number, r: { total_usd: number }) => s + Number(r.total_usd), 0);
  const pendingTotal = invoices.filter(i => i.status === "pending").reduce((s, i) => s + Number(i.total_usd), 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.4px" }}>Invoices</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Auto-generated daily when inboxes are provisioned. Paid via PayPal.</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        {[
          { label: "This Month (Paid)",  value: `$${monthPaid.toFixed(2)}`,    color: "#16a34a" },
          { label: "Awaiting Payment",   value: `$${pendingTotal.toFixed(2)}`, color: pendingTotal > 0 ? "#d97706" : "#0f172a" },
          { label: "Total Invoices",     value: invoices.length,               color: "#0f172a" },
        ].map(card => (
          <div key={card.label} style={{
            background: "#fff", borderRadius: 10, padding: "16px 20px",
            border: "1px solid #e2e8f0", flex: "1 1 160px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: card.color, letterSpacing: "-0.4px" }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Invoices table */}
      {invoices.length === 0 ? (
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          padding: "48px 32px", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>No invoices yet</div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Invoices are generated automatically when inboxes are provisioned.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "130px 80px 90px 90px 120px 1fr",
            padding: "10px 20px",
            borderBottom: "1px solid #f1f5f9",
            background: "#f8fafc",
          }}>
            {["Invoice #", "Date", "Inboxes", "Total", "Status", ""].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {h}
              </span>
            ))}
          </div>

          {invoices.map((inv, i) => (
            <div
              key={inv.id}
              style={{
                display: "grid",
                gridTemplateColumns: "130px 80px 90px 90px 120px 1fr",
                padding: "14px 20px",
                borderBottom: i < invoices.length - 1 ? "1px solid #f8fafc" : "none",
                alignItems: "center",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{inv.invoice_number}</span>
              <span style={{ fontSize: 13, color: "#374151" }}>{new Date(inv.invoice_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span style={{ fontSize: 13, color: "#374151" }}>{inv.inbox_count}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>${Number(inv.total_usd).toFixed(2)}</span>
              <StatusBadge status={inv.status} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {(inv.status === "pending" || inv.status === "sent") && (
                  inv.paypal_payment_url ? (
                    <a
                      href={inv.paypal_payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        background: "#003087", color: "#fff",
                        padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                        textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5,
                      }}
                    >
                      Pay with PayPal
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Awaiting PayPal link</span>
                  )
                )}
                {inv.paypal_payment_id && (
                  <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
                    txn: {inv.paypal_payment_id.slice(0, 16)}…
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment instructions */}
      <div style={{
        marginTop: 24, background: "#fffbeb", border: "1px solid #fde68a",
        borderRadius: 10, padding: "14px 18px",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>Payment via PayPal</div>
        <div style={{ fontSize: 12, color: "#b45309", lineHeight: 1.6 }}>
          Pending invoices are paid manually via PayPal. The Leadash team will send a PayPal payment link for each invoice.
          Invoices are auto-generated daily at midnight based on inboxes provisioned that day.
          Rate: <strong>${(invoices[0]?.cost_per_inbox_usd ?? 2).toFixed(2)}/inbox</strong>.
        </div>
      </div>
    </div>
  );
}
