import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";

interface PendingOrder {
  id:         string;
  domain:     string;
  workspace_id: string;
  created_at: string;
  inboxes:    { id: string; email_address: string }[];
}

export default async function VendorOrdersPage() {
  const db = createAdminClient();

  const { data: domains } = await db
    .from("outreach_domains")
    .select("id, domain, workspace_id, created_at")
    .eq("inbox_provider", "microsoft365")
    .eq("status", "provisioning")
    .order("created_at", { ascending: false });

  const orders: PendingOrder[] = [];
  for (const d of domains ?? []) {
    const { data: inboxes } = await db
      .from("outreach_inboxes")
      .select("id, email_address")
      .eq("domain_id", d.id)
      .eq("status", "provisioning");
    orders.push({ ...d, inboxes: inboxes ?? [] });
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Pending Microsoft 365 Orders</h1>
      <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>{orders.length} order{orders.length !== 1 ? "s" : ""} awaiting provisioning</p>

      {orders.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 32, textAlign: "center", color: "#9ca3af" }}>
          No pending orders. All caught up!
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map(order => (
            <div key={order.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{order.domain}</span>
                  <span style={{ marginLeft: 10, background: "#fef9c3", color: "#92400e", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99 }}>PENDING</span>
                  <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>
                    {order.inboxes.length} inbox{order.inboxes.length !== 1 ? "es" : ""} &middot; ordered {new Date(order.created_at).toLocaleDateString()}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {order.inboxes.map(inbox => (
                      <span key={inbox.id} style={{ background: "#f3f4f6", color: "#374151", fontSize: 12, padding: "2px 10px", borderRadius: 99 }}>
                        {inbox.email_address}
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  href={`/vendor/orders/${order.id}`}
                  style={{ background: "#111", color: "#fff", padding: "9px 20px", borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  Provision →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
