export const metadata = { title: "Dashboard — Leadash Vendor Portal" };

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";

async function checkAuth() {
  const jar      = await cookies();
  const token    = jar.get("vendor_token")?.value;
  const expected = process.env.VENDOR_PORTAL_SECRET;
  if (!expected || token !== expected) redirect("/vendor/login");
}

function StatCard({
  label, value, sub, color = "#0f172a",
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "20px 24px",
      border: "1px solid #e2e8f0", flex: "1 1 200px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: "-0.5px", lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  provisioning:  { bg: "#fef9c3", color: "#92400e", label: "Pending"  },
  active:        { bg: "#dcfce7", color: "#166534", label: "Active"   },
  failed:        { bg: "#fee2e2", color: "#991b1b", label: "Failed"   },
  payment_failed:{ bg: "#fee2e2", color: "#991b1b", label: "Suspended"},
  pending:       { bg: "#f1f5f9", color: "#475569", label: "Pending"  },
  sent:          { bg: "#dbeafe", color: "#1d4ed8", label: "Sent"     },
  paid:          { bg: "#dcfce7", color: "#166534", label: "Paid"     },
  void:          { bg: "#f1f5f9", color: "#94a3b8", label: "Void"     },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: "#f1f5f9", color: "#475569", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      padding: "3px 9px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      {s.label}
    </span>
  );
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  inbox_count: number;
  total_usd: number;
  status: string;
}

interface Order {
  id: string;
  domain: string;
  status: string;
  created_at: string;
  inboxes: { id: string; email_address: string }[];
}

export default async function VendorDashboardPage() {
  await checkAuth();
  const db = createAdminClient();

  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [activeRes, pendingRes, invoiceSumRes, costRes, recentInvoicesRes, recentOrdersRes] = await Promise.all([
    db.from("outreach_inboxes").select("id", { count: "exact", head: true })
      .eq("provider", "microsoft365").eq("status", "active"),
    db.from("outreach_domains").select("id", { count: "exact", head: true })
      .eq("inbox_provider", "microsoft365").eq("status", "provisioning"),
    db.from("vendor_invoices").select("total_usd").eq("status", "paid").gte("invoice_date", monthStart),
    db.from("admin_settings").select("value").eq("key", "vendor_cost_per_inbox_usd").single(),
    db.from("vendor_invoices").select("id, invoice_number, invoice_date, inbox_count, total_usd, status")
      .order("invoice_date", { ascending: false }).limit(5),
    db.from("outreach_domains").select("id, domain, status, created_at")
      .eq("inbox_provider", "microsoft365").order("created_at", { ascending: false }).limit(5),
  ]);

  const activeCount   = activeRes.count ?? 0;
  const costPerInbox  = parseFloat(costRes.data?.value ?? "2.00");
  const mrr           = activeCount * costPerInbox;
  const monthEarnings = (invoiceSumRes.data ?? []).reduce(
    (s: number, r: { total_usd: number }) => s + Number(r.total_usd), 0,
  );

  // Fetch inbox counts for recent orders
  const recentOrders: Order[] = [];
  for (const d of recentOrdersRes.data ?? []) {
    const { data: inboxes } = await db.from("outreach_inboxes")
      .select("id, email_address").eq("domain_id", d.id).limit(5);
    recentOrders.push({ ...d, inboxes: inboxes ?? [] });
  }

  const recentInvoices: Invoice[] = recentInvoicesRes.data ?? [];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.4px" }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          {now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 32 }}>
        <StatCard label="Active Inboxes"   value={activeCount}        sub={`$${costPerInbox.toFixed(2)}/inbox/mo`} />
        <StatCard label="Pending Orders"   value={pendingRes.count ?? 0} color={pendingRes.count ? "#d97706" : "#0f172a"} />
        <StatCard label="MRR"              value={`$${mrr.toFixed(2)}`} sub="based on active inboxes" color="#16a34a" />
        <StatCard label="This Month"       value={`$${monthEarnings.toFixed(2)}`} sub="from paid invoices" />
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Recent Orders */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Recent Orders</h2>
            <Link href="/vendor/orders" style={{ fontSize: 12, color: "#f97316", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
          </div>
          <div>
            {recentOrders.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No orders yet.</div>
            ) : recentOrders.map((order, i) => (
              <Link key={order.id} href={`/vendor/orders/${order.id}`} style={{
                display: "block", padding: "14px 20px",
                borderBottom: i < recentOrders.length - 1 ? "1px solid #f8fafc" : "none",
                textDecoration: "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>{order.domain}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      {order.inboxes.length} inbox{order.inboxes.length !== 1 ? "es" : ""} &middot;{" "}
                      {new Date(order.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Invoices */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Recent Invoices</h2>
            <Link href="/vendor/invoices" style={{ fontSize: 12, color: "#f97316", textDecoration: "none", fontWeight: 600 }}>View all →</Link>
          </div>
          <div>
            {recentInvoices.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No invoices yet.</div>
            ) : recentInvoices.map((inv, i) => (
              <div key={inv.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: i < recentInvoices.length - 1 ? "1px solid #f8fafc" : "none",
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", fontFamily: "monospace" }}>{inv.invoice_number}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                    {inv.inbox_count} inbox{inv.inbox_count !== 1 ? "es" : ""} &middot;{" "}
                    {new Date(inv.invoice_date).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>${Number(inv.total_usd).toFixed(2)}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
