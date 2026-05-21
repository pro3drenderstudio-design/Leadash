export const metadata = { title: "Orders — Leadash Vendor Portal" };

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

const STATUS_TABS = [
  { key: "all",          label: "All Orders"    },
  { key: "provisioning", label: "Pending"       },
  { key: "active",       label: "Active"        },
  { key: "failed",       label: "Failed"        },
];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  provisioning:  { bg: "#fef9c3", color: "#92400e", label: "Pending"  },
  active:        { bg: "#dcfce7", color: "#166534", label: "Active"   },
  failed:        { bg: "#fee2e2", color: "#991b1b", label: "Failed"   },
  payment_failed:{ bg: "#fee2e2", color: "#991b1b", label: "Suspended"},
  dns_pending:   { bg: "#dbeafe", color: "#1d4ed8", label: "DNS"      },
  purchasing:    { bg: "#f3e8ff", color: "#7c3aed", label: "Buying"   },
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

interface Order {
  id: string;
  domain: string;
  status: string;
  created_at: string;
  inboxes: { id: string; email_address: string; status: string }[];
}

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await checkAuth();
  const sp          = await searchParams;
  const activeTab   = sp.status ?? "all";
  const db          = createAdminClient();

  let query = db
    .from("outreach_domains")
    .select("id, domain, status, created_at")
    .eq("inbox_provider", "microsoft365")
    .order("created_at", { ascending: false });

  if (activeTab !== "all") query = query.eq("status", activeTab);

  const { data: domains } = await query;

  const orders: Order[] = [];
  for (const d of domains ?? []) {
    const { data: inboxes } = await db.from("outreach_inboxes")
      .select("id, email_address, status").eq("domain_id", d.id).order("email_address");
    orders.push({ ...d, inboxes: inboxes ?? [] });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.4px" }}>Orders</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            All Microsoft 365 provisioning orders
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STATUS_TABS.map(tab => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/vendor/orders" : `/vendor/orders?status=${tab.key}`}
            style={{
              padding: "7px 16px", borderRadius: 99, fontSize: 13, fontWeight: 500,
              textDecoration: "none", transition: "all 0.15s",
              background: activeTab === tab.key ? "#0f172a" : "#fff",
              color:      activeTab === tab.key ? "#fff"    : "#64748b",
              border: `1px solid ${activeTab === tab.key ? "#0f172a" : "#e2e8f0"}`,
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <div style={{
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
          padding: "48px 32px", textAlign: "center",
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>No orders found</div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>
            {activeTab === "all" ? "No Microsoft 365 orders placed yet." : `No orders with status "${activeTab}".`}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {orders.map(order => {
            const pendingInboxes = order.inboxes.filter(i => i.status === "provisioning").length;
            const activeInboxes  = order.inboxes.filter(i => i.status === "active").length;
            return (
              <div key={order.id} style={{
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{order.domain}</span>
                    <StatusBadge status={order.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                    {order.inboxes.length} inbox{order.inboxes.length !== 1 ? "es" : ""}
                    {pendingInboxes > 0 && ` · ${pendingInboxes} pending`}
                    {activeInboxes > 0  && ` · ${activeInboxes} active`}
                    {" · "}ordered {new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  {/* Email pills */}
                  {order.status === "provisioning" && order.inboxes.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                      {order.inboxes.slice(0, 5).map(inbox => (
                        <span key={inbox.id} style={{
                          background: "#f8fafc", border: "1px solid #e2e8f0",
                          color: "#475569", fontSize: 11, padding: "2px 8px", borderRadius: 99, fontFamily: "monospace",
                        }}>
                          {inbox.email_address}
                        </span>
                      ))}
                      {order.inboxes.length > 5 && (
                        <span style={{ fontSize: 11, color: "#94a3b8", padding: "2px 0" }}>
                          +{order.inboxes.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {order.status === "provisioning" && (
                  <Link href={`/vendor/orders/${order.id}`} style={{
                    background: "#0f172a", color: "#fff", padding: "9px 20px",
                    borderRadius: 9, fontWeight: 600, fontSize: 13, textDecoration: "none",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    Provision →
                  </Link>
                )}
                {order.status !== "provisioning" && (
                  <Link href={`/vendor/orders/${order.id}`} style={{
                    background: "#f8fafc", color: "#475569", padding: "9px 20px",
                    borderRadius: 9, fontWeight: 500, fontSize: 13, textDecoration: "none",
                    whiteSpace: "nowrap", flexShrink: 0, border: "1px solid #e2e8f0",
                  }}>
                    View
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
