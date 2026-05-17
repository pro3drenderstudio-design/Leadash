import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString("en-NG", { month: "short", year: "2-digit" });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now            = new Date();
  const monthStart     = startOfMonth(now).toISOString();
  const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString();
  const thirteenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1).toISOString();

  // ── Parallel data fetches ────────────────────────────────────────────────────
  const [
    { data: planConfigs },
    { data: workspaces },
    { data: dedicatedIps },
    { data: inboxDomains },
    { data: invoicesRaw },
    { data: recentInvoicesRaw },
  ] = await Promise.all([
    // Plan configs (prices)
    db.from("plan_configs").select("plan_id, name, price_ngn, sort_order").order("sort_order"),

    // All workspaces (lightweight — billing status + identity for drill-downs)
    db.from("workspaces").select("id, name, plan_id, plan_status, trial_ends_at, created_at"),

    // Active dedicated IP subscriptions
    db.from("dedicated_ip_subscriptions").select("price_ngn").eq("status", "active"),

    // Active inbox billing (domains with a recurring charge set up)
    db.from("outreach_domains")
      .select("paystack_inbox_monthly_kobo")
      .gt("paystack_inbox_monthly_kobo", 0),

    // All paid invoices from last 13 months (for chart + this-month totals)
    db.from("billing_invoices")
      .select("type, amount_kobo, created_at")
      .eq("status", "paid")
      .gte("created_at", thirteenMonthsAgo)
      .order("created_at", { ascending: true }),

    // Recent 25 invoices with workspace name + id for linking
    db.from("billing_invoices")
      .select("id, type, description, amount_kobo, created_at, workspace_id, workspaces(id, name)")
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  type PlanConfig = { plan_id: string; name: string | null; price_ngn: number | null; sort_order: number | null };
  type WsRow      = { id: string; name: string | null; plan_id: string | null; plan_status: string | null; trial_ends_at: string | null; created_at: string | null };
  type IpRow      = { price_ngn: number | null };
  type InboxRow   = { paystack_inbox_monthly_kobo: number | null };
  type InvoiceRow = { type: string | null; amount_kobo: number | null; created_at: string | null };

  const plans     = (planConfigs   ?? []) as PlanConfig[];
  const ws        = (workspaces    ?? []) as WsRow[];
  const ips       = (dedicatedIps  ?? []) as IpRow[];
  const inboxes   = (inboxDomains  ?? []) as InboxRow[];
  const invoices  = (invoicesRaw   ?? []) as InvoiceRow[];
  const priceMap  = Object.fromEntries(plans.map((p: PlanConfig) => [p.plan_id, p.price_ngn ?? 0]));

  // ── MRR calculation ──────────────────────────────────────────────────────────
  // Beta = trial_ends_at IS NOT NULL (not yet converted to commercial paying).
  // Commercial = trial_ends_at IS NULL, plan_id != 'free', plan_status determines health.

  const planCounts: Record<string, number> = {};
  let activePaid       = 0;
  let pastDue          = 0;
  let trialing         = 0;
  let freeCount        = 0;
  let atRiskMrr        = 0;
  let trialPipelineMrr = 0;
  let betaCount        = 0;
  let betaMrrNgn       = 0;

  for (const w of ws) {
    const planId = w.plan_id ?? "free";
    const status = w.plan_status ?? "active";
    const isBeta = !!w.trial_ends_at;

    if (planId === "free") { freeCount++; continue; }

    const price = priceMap[planId] ?? 0;

    if (isBeta) {
      // Beta programme — counts as pipeline, never commercial MRR
      betaCount++;
      betaMrrNgn += price;
      continue;
    }

    // Commercial workspaces
    if (status === "active") {
      planCounts[planId] = (planCounts[planId] ?? 0) + 1;
      activePaid++;
    } else if (status === "past_due") {
      pastDue++;
      atRiskMrr += price;
    } else if (status === "trialing") {
      trialing++;
      trialPipelineMrr += price;
    }
  }

  let plansMrr = 0;
  const planBreakdown = plans
    .filter(p => p.plan_id !== "free")
    .map(p => {
      const count  = planCounts[p.plan_id] ?? 0;
      const mrrNgn = count * (p.price_ngn ?? 0);
      plansMrr += mrrNgn;
      return { plan_id: p.plan_id, name: p.name, count, price_ngn: p.price_ngn ?? 0, mrr_ngn: mrrNgn };
    })
    .filter(p => p.count > 0 || plans.length <= 6); // always show defined tiers

  // Dedicated IP add-on MRR
  const ipMrr = ips.reduce((s, r: IpRow) => s + (r.price_ngn ?? 0), 0);

  // Inbox billing MRR (kobo → NGN)
  const inboxMrr = Math.round(
    inboxes.reduce((s, r: InboxRow) => s + (r.paystack_inbox_monthly_kobo ?? 0), 0) / 100
  );

  const totalMrr = plansMrr + ipMrr + inboxMrr;
  const arrNgn   = totalMrr * 12;
  const arpu     = activePaid > 0 ? Math.round(totalMrr / activePaid) : 0;

  // ── Invoice aggregations ────────────────────────────────────────────────────

  // Total revenue all-time from invoices in window (we also fetch all-time below via sum)
  const allTimeRevenue = invoices.reduce((s, i: InvoiceRow) => s + (i.amount_kobo ?? 0), 0);

  // This-month collected
  const thisMonthRevenue = invoices
    .filter((i: InvoiceRow) => (i.created_at ?? "") >= monthStart)
    .reduce((s, i: InvoiceRow) => s + (i.amount_kobo ?? 0), 0);

  // Last-month collected (for MoM delta)
  const lastMonthRevenue = invoices
    .filter((i: InvoiceRow) => (i.created_at ?? "") >= prevMonthStart && (i.created_at ?? "") < monthStart)
    .reduce((s, i: InvoiceRow) => s + (i.amount_kobo ?? 0), 0);

  const momDeltaPct = lastMonthRevenue > 0
    ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : null;

  // Revenue type breakdown this month (kobo → NGN)
  const typeBreakdown: Record<string, number> = {};
  for (const inv of invoices) {
    if ((inv.created_at ?? "") >= monthStart) {
      const t = inv.type ?? "unknown";
      typeBreakdown[t] = (typeBreakdown[t] ?? 0) + Math.round((inv.amount_kobo ?? 0) / 100);
    }
  }

  // ── 12-month chart data ─────────────────────────────────────────────────────
  // Build ordered list of last 12 month keys
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d.toISOString()));
  }

  // Bucket invoices into month × type
  const chartBuckets: Record<string, Record<string, number>> = {};
  for (const mk of months) chartBuckets[mk] = {};

  for (const inv of invoices) {
    const mk = monthKey(inv.created_at ?? "");
    if (!chartBuckets[mk]) continue;
    const t   = inv.type ?? "unknown";
    const ngn = Math.round((inv.amount_kobo ?? 0) / 100);
    chartBuckets[mk][t] = (chartBuckets[mk][t] ?? 0) + ngn;
  }

  const chartData = months.map(mk => ({
    month: monthLabel(mk),
    plans:    (chartBuckets[mk]["plan_subscription"] ?? 0) + (chartBuckets[mk]["plan_renewal"] ?? 0),
    credits:  chartBuckets[mk]["credit_purchase"] ?? 0,
    addons:   (chartBuckets[mk]["dedicated_ip"] ?? 0) + (chartBuckets[mk]["dedicated_ip_renewal"] ?? 0) + (chartBuckets[mk]["inbox_billing"] ?? 0),
    academy:  chartBuckets[mk]["academy_enrollment"] ?? 0,
    total:    Object.values(chartBuckets[mk]).reduce((s, v) => s + v, 0),
  }));

  // ── New subscriptions this month (unique workspaces with first plan_subscription invoice) ──
  // Count distinct workspaces that have a plan_subscription invoice in billing_invoices
  // We don't have workspace_id in the fetch above so count from invoice data that we do have
  // — use a separate lightweight query
  const [{ count: newSubsCount }, { count: churnCount }] = await Promise.all([
    db.from("billing_invoices")
      .select("*", { count: "exact", head: true })
      .eq("type", "plan_subscription")
      .eq("status", "paid")
      .gte("created_at", monthStart),

    db.from("activity_log")
      .select("*", { count: "exact", head: true })
      .eq("type", "subscription_cancelled")
      .gte("created_at", monthStart),
  ]);

  // ── Top customers (commercial active, ordered by plan price) ────────────────
  const topCustomers = ws
    .filter((w: WsRow) => !w.trial_ends_at && (w.plan_id ?? "free") !== "free")
    .map((w: WsRow) => ({
      id:          w.id,
      name:        w.name ?? "—",
      plan_id:     w.plan_id ?? "free",
      plan_status: w.plan_status ?? "active",
      mrr_ngn:     priceMap[w.plan_id ?? "free"] ?? 0,
      created_at:  w.created_at,
    }))
    .sort((a, b) => b.mrr_ngn - a.mrr_ngn)
    .slice(0, 10);

  // ── Recent transactions ─────────────────────────────────────────────────────
  const recentTransactions = (recentInvoicesRaw ?? []).map((inv: Record<string, unknown>) => ({
    id:             inv.id,
    type:           inv.type,
    description:    inv.description,
    amount_ngn:     Math.round(((inv.amount_kobo as number) ?? 0) / 100),
    created_at:     inv.created_at,
    workspace_id:   (inv.workspaces as { id?: string } | null)?.id ?? null,
    workspace_name: (inv.workspaces as { name?: string } | null)?.name ?? "—",
  }));

  return NextResponse.json({
    // MRR
    mrr_ngn:      totalMrr,
    arr_ngn:      arrNgn,
    plans_mrr:    plansMrr,
    ip_mrr:       ipMrr,
    inbox_mrr:    inboxMrr,

    // Collected revenue (kobo → NGN)
    all_time_revenue_ngn:   Math.round(allTimeRevenue / 100),
    this_month_revenue_ngn: Math.round(thisMonthRevenue / 100),
    last_month_revenue_ngn: Math.round(lastMonthRevenue / 100),
    mom_delta_pct:          momDeltaPct,

    // Users
    active_paid:  activePaid,
    past_due:     pastDue,
    trialing:     trialing,
    free_count:   freeCount,
    arpu_ngn:     arpu,

    // Beta programme (excluded from commercial MRR)
    beta_count:            betaCount,
    beta_mrr_ngn:          betaMrrNgn,

    // Pipeline & risk
    at_risk_mrr_ngn:       atRiskMrr,
    trial_pipeline_mrr_ngn: trialPipelineMrr,

    // Subscription changes this month
    new_subs_count:   newSubsCount ?? 0,
    churn_count:      churnCount ?? 0,

    // Plan breakdown table
    plan_breakdown: planBreakdown,

    // Revenue type mix this month (NGN)
    type_breakdown: typeBreakdown,

    // Chart (12 months)
    chart: chartData,

    // Top customers
    top_customers: topCustomers,

    // Recent transactions
    recent_transactions: recentTransactions,

    generated_at: now.toISOString(),
  });
}
