import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url  = new URL(req.url);
  const type = url.searchParams.get("type") ?? "plan";

  // ── Inbox billing ────────────────────────────────────────────────────────────
  if (type === "inbox") {
    const { data: rawDomains } = await db
      .from("outreach_domains")
      .select("id, domain, mailbox_count, paystack_inbox_monthly_kobo, inbox_next_billing_date, workspace_id, workspaces(id, name, slug)")
      .gt("paystack_inbox_monthly_kobo", 0)
      .order("workspace_id");

    type DomRow = {
      id: string;
      domain: string;
      mailbox_count: number | null;
      paystack_inbox_monthly_kobo: number | null;
      inbox_next_billing_date: string | null;
      workspace_id: string | null;
      workspaces: { id: string; name: string; slug: string } | null;
    };

    const wsMap: Record<string, {
      workspace_id:   string;
      workspace_name: string;
      workspace_slug: string;
      total_kobo:     number;
      domains: { id: string; domain: string; mailbox_count: number; monthly_ngn: number; next_billing_date: string | null }[];
    }> = {};

    for (const d of (rawDomains ?? []) as DomRow[]) {
      const wsId   = d.workspaces?.id   ?? d.workspace_id ?? "";
      const wsName = d.workspaces?.name ?? "—";
      const wsSlug = d.workspaces?.slug ?? "";
      if (!wsId) continue;
      if (!wsMap[wsId]) wsMap[wsId] = { workspace_id: wsId, workspace_name: wsName, workspace_slug: wsSlug, total_kobo: 0, domains: [] };
      wsMap[wsId].total_kobo += d.paystack_inbox_monthly_kobo ?? 0;
      wsMap[wsId].domains.push({
        id:               d.id,
        domain:           d.domain,
        mailbox_count:    d.mailbox_count ?? 1,
        monthly_ngn:      Math.round((d.paystack_inbox_monthly_kobo ?? 0) / 100),
        next_billing_date: d.inbox_next_billing_date ?? null,
      });
    }

    const subscriptions = Object.values(wsMap)
      .map(ws => ({
        workspace_id:      ws.workspace_id,
        workspace_name:    ws.workspace_name,
        workspace_slug:    ws.workspace_slug,
        total_monthly_ngn: Math.round(ws.total_kobo / 100),
        domain_count:      ws.domains.length,
        mailbox_count:     ws.domains.reduce((s, d) => s + d.mailbox_count, 0),
        next_billing_date: ws.domains
          .map(d => d.next_billing_date)
          .filter(Boolean)
          .sort()[0] ?? null,
        domains: ws.domains,
      }))
      .sort((a, b) => b.total_monthly_ngn - a.total_monthly_ngn);

    return NextResponse.json({ subscriptions });
  }

  // ── Plan subscriptions ───────────────────────────────────────────────────────
  const [
    { data: rawWorkspaces },
    { data: rawPlans },
    { data: rawInvoices },
  ] = await Promise.all([
    db.from("workspaces")
      .select("id, name, slug, plan_id, plan_status, trial_ends_at, created_at")
      .neq("plan_id", "free"),
    db.from("plan_configs")
      .select("plan_id, name, price_ngn, sort_order")
      .order("sort_order"),
    db.from("billing_invoices")
      .select("workspace_id, type, amount_kobo, created_at")
      .in("type", ["plan_subscription", "plan_renewal"])
      .eq("status", "paid")
      .order("created_at", { ascending: true })
      .limit(50_000),
  ]);

  type PlanCfg = { plan_id: string; name: string | null; price_ngn: number | null; sort_order: number | null };
  type WsRow   = { id: string; name: string; slug: string; plan_id: string | null; plan_status: string | null; trial_ends_at: string | null; created_at: string | null };
  type InvRow  = { workspace_id: string | null; type: string | null; amount_kobo: number | null; created_at: string | null };

  const planMap = Object.fromEntries(((rawPlans ?? []) as PlanCfg[]).map(p => [p.plan_id, p]));

  // Aggregate invoices per workspace (invoices arrive sorted by created_at ASC)
  const agg: Record<string, { first: string; last: string; total_kobo: number; count: number }> = {};
  for (const inv of (rawInvoices ?? []) as InvRow[]) {
    const wid = inv.workspace_id ?? "";
    if (!wid || !inv.created_at) continue;
    if (!agg[wid]) agg[wid] = { first: inv.created_at, last: inv.created_at, total_kobo: 0, count: 0 };
    agg[wid].last       = inv.created_at;  // already ASC so last wins
    agg[wid].total_kobo += inv.amount_kobo ?? 0;
    agg[wid].count++;
  }

  const subscriptions = ((rawWorkspaces ?? []) as WsRow[]).map(w => {
    const plan         = planMap[w.plan_id ?? ""] ?? null;
    const invoiceAgg   = agg[w.id]  ?? null;
    const lastBilled   = invoiceAgg?.last ?? null;
    const subscribedAt = invoiceAgg?.first ?? w.created_at ?? null;
    const estNext      = lastBilled
      ? addDays(lastBilled, 30)
      : subscribedAt ? addDays(subscribedAt, 30) : null;

    return {
      workspace_id:     w.id,
      workspace_name:   w.name,
      workspace_slug:   w.slug,
      plan_id:          w.plan_id ?? "free",
      plan_name:        plan?.name ?? w.plan_id ?? "—",
      plan_status:      w.plan_status,
      is_beta:          !!w.trial_ends_at && !invoiceAgg,
      trial_ends_at:    w.trial_ends_at,
      price_ngn:        plan?.price_ngn ?? 0,
      subscribed_at:    subscribedAt,
      last_billed_at:   lastBilled,
      est_next_renewal: estNext,
      lifetime_ngn:     Math.round((invoiceAgg?.total_kobo ?? 0) / 100),
      invoice_count:    invoiceAgg?.count ?? 0,
    };
  });

  subscriptions.sort((a, b) =>
    (b.price_ngn - a.price_ngn) || ((a.subscribed_at ?? "") > (b.subscribed_at ?? "") ? 1 : -1)
  );

  return NextResponse.json({ subscriptions });
}
