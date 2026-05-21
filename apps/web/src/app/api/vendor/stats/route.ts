import { NextRequest, NextResponse } from "next/server";
import { requireVendorAuth } from "@/lib/vendor/auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  if (!requireVendorAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();

  const now       = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [activeRes, pendingRes, invoiceSumRes, vendorCostRes, recentInvoicesRes] = await Promise.all([
    // Active M365 inboxes
    db.from("outreach_inboxes").select("id", { count: "exact", head: true })
      .eq("provider", "microsoft365").eq("status", "active"),
    // Pending provisioning orders
    db.from("outreach_domains").select("id", { count: "exact", head: true })
      .eq("inbox_provider", "microsoft365").eq("status", "provisioning"),
    // This month's total from paid invoices
    db.from("vendor_invoices").select("total_usd").eq("status", "paid").gte("invoice_date", monthStart.slice(0, 10)),
    // Vendor cost per inbox
    db.from("admin_settings").select("value").eq("key", "vendor_cost_per_inbox_usd").single(),
    // Recent invoices
    db.from("vendor_invoices").select("*").order("invoice_date", { ascending: false }).limit(5),
  ]);

  const activeCount    = activeRes.count ?? 0;
  const costPerInbox   = parseFloat(vendorCostRes.data?.value ?? "2.00");
  const mrr            = activeCount * costPerInbox;
  const monthEarnings  = (invoiceSumRes.data ?? []).reduce((s: number, r: { total_usd: number }) => s + Number(r.total_usd), 0);

  return NextResponse.json({
    active_inboxes:   activeCount,
    pending_orders:   pendingRes.count ?? 0,
    cost_per_inbox:   costPerInbox,
    mrr,
    month_earnings:   monthEarnings,
    recent_invoices:  recentInvoicesRes.data ?? [],
  });
}
