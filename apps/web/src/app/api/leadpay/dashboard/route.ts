import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const now       = new Date();
  const mtdStart  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [accountRes, receivedMtdRes, paidOutMtdRes, invoicesMtdRes, recentTxRes, unpaidRes] = await Promise.all([
    db.from("leadpay_accounts")
      .select("usd_balance_cents, usd_pending_cents")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),

    // Received MTD = paid invoices this month
    db.from("leadpay_invoices")
      .select("net_usd_cents")
      .eq("workspace_id", workspaceId)
      .eq("status", "paid")
      .gte("paid_at", mtdStart),

    // Paid out MTD = completed payouts this month
    db.from("leadpay_payouts")
      .select("usd_amount_cents")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("created_at", mtdStart),

    // Invoices sent MTD
    db.from("leadpay_invoices")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .neq("status", "draft")
      .gte("created_at", mtdStart),

    // Recent transactions
    db.from("leadpay_transactions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10),

    // Unpaid invoices
    db.from("leadpay_invoices")
      .select("*, client:leadpay_clients(*)")
      .eq("workspace_id", workspaceId)
      .in("status", ["sent", "viewed", "overdue"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);

  const account      = accountRes.data;
  const receivedMtd  = (receivedMtdRes.data ?? []).reduce((s, i) => s + (i.net_usd_cents ?? 0), 0);
  const paidOutMtd   = (paidOutMtdRes.data ?? []).reduce((s, p) => s + (p.usd_amount_cents ?? 0), 0);

  return NextResponse.json({
    usd_balance_cents:   account?.usd_balance_cents   ?? 0,
    usd_pending_cents:   account?.usd_pending_cents   ?? 0,
    received_mtd_cents:  receivedMtd,
    paid_out_mtd_cents:  paidOutMtd,
    invoices_sent_mtd:   invoicesMtdRes.count ?? 0,
    avg_payment_days:    null,
    recent_transactions: recentTxRes.data ?? [],
    unpaid_invoices:     unpaidRes.data ?? [],
  });
}
