/**
 * POST /api/billing/combined-checkout
 *
 * One Paystack payment for: plan (month-1, or year-1 if annual) + first-month
 * managed-inbox hosting + one-time domain registration. Paystack can't mix a
 * subscription and one-off line items in a single transaction, so this charges
 * a single one-off total; the webhook (type "combined_checkout") then attaches
 * a NATIVE Paystack subscription deferred by 30/365 days for plan renewals and
 * hands the inboxes to the normal saved-auth-code inbox-billing cron.
 *
 * Domains are chosen by the user (5 mailboxes/domain). Postal + Paystack only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { getUsdToNgn } from "@/lib/billing/exchangeRate";
import { createAdminClient } from "@/lib/supabase/server";

const MAX_MAILBOXES_PER_DOMAIN = 5;

async function domainMarkupUsd(domainPriceUsd: number): Promise<number> {
  if (domainPriceUsd <= 0) return 0;
  try {
    const adminDb = createAdminClient();
    const { data } = await adminDb.from("admin_settings").select("key, value")
      .in("key", ["domain_markup_type", "domain_markup_value"]);
    const map = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const type = (map.domain_markup_type as string) ?? "flat";
    const value = Number(map.domain_markup_value ?? 1);
    if (type === "none") return 0;
    if (type === "percent") return domainPriceUsd * (Number.isFinite(value) ? value : 0) / 100;
    return Number.isFinite(value) ? value : 1; // flat
  } catch {
    return 1;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body = await req.json() as {
    plan_id:          string;
    interval?:        "monthly" | "annual";
    domains:          Array<{ domain: string; price: number }>;
    mailbox_prefixes: string[]; // applied to every domain (mirrors /outreach/domains/checkout)
    first_name?:      string;
    last_name?:       string;
    redirect_url?:    string;
    reply_forward_to?: string;
  };

  const isAnnual = body.interval === "annual";
  const plan = await getPlanById(body.plan_id);
  if (!plan || plan.plan_id === "free") return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  const planCode = isAnnual ? plan.paystack_plan_code_annual : plan.paystack_plan_code;
  if (!planCode) return NextResponse.json({ error: isAnnual ? "Annual billing isn't configured for this plan." : "This plan has no payment integration configured." }, { status: 400 });

  if (!body.domains?.length) return NextResponse.json({ error: "At least one domain is required" }, { status: 400 });
  if (!body.mailbox_prefixes?.length || body.mailbox_prefixes.length > MAX_MAILBOXES_PER_DOMAIN) {
    return NextResponse.json({ error: `mailbox_prefixes must have 1–${MAX_MAILBOXES_PER_DOMAIN} entries` }, { status: 400 });
  }

  const ngnPerUsd = await getUsdToNgn();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const mailboxCount = body.mailbox_prefixes.length;

  // ── Create one domain record per domain (postal), summing one-time reg ──
  const insertedIds: string[] = [];
  let totalOneTimeUsd = 0;

  for (const d of body.domains) {
    const regUsd = d.price > 0 ? d.price + await domainMarkupUsd(d.price) : 0;
    totalOneTimeUsd += regUsd;

    const { data: existing } = await db.from("outreach_domains")
      .select("id").eq("workspace_id", workspaceId).eq("domain", d.domain)
      .in("status", ["pending", "failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const row = {
      workspace_id:     workspaceId,
      domain:           d.domain,
      status:           "pending",
      mailbox_count:    mailboxCount,
      mailbox_prefix:   body.mailbox_prefixes[0],
      mailbox_prefixes: body.mailbox_prefixes,
      first_name:       body.first_name ?? null,
      last_name:        body.last_name ?? null,
      daily_send_limit: 30,
      payment_provider: "paystack",
      domain_price_usd: d.price,
      domain_source:    d.price > 0 ? "leadash" : "external",
      redirect_url:     body.redirect_url ?? null,
      reply_forward_to: body.reply_forward_to ?? null,
      error_message:    null,
      updated_at:       new Date().toISOString(),
    };

    let recId: string;
    if (existing) {
      await db.from("outreach_domains").update(row).eq("id", existing.id);
      recId = existing.id;
    } else {
      const { data: rec, error } = await db.from("outreach_domains").insert(row).select("id").single();
      if (error || !rec) return NextResponse.json({ error: error?.message ?? "Failed to create domain record" }, { status: 500 });
      recId = rec.id;
    }
    insertedIds.push(recId);
  }

  // ── Compose the single combined total ──
  const totalInboxes    = mailboxCount * body.domains.length;
  const planNgn         = isAnnual ? plan.price_ngn * 10 : plan.price_ngn;
  const inboxUnitNgn    = plan.inbox_monthly_price_ngn;
  const inboxMonthlyNgn = inboxUnitNgn * totalInboxes;
  const domainRegNgn    = Math.round(totalOneTimeUsd * ngnPerUsd);
  const totalKobo       = Math.round((planNgn + inboxMonthlyNgn + domainRegNgn) * 100);
  const perDomainInboxKobo = Math.round((inboxUnitNgn * mailboxCount) * 100);

  const { data: workspace } = await db.from("workspaces").select("billing_email").eq("id", workspaceId).single();
  const domainIdsParam = insertedIds.join(",");
  // Callback lands on the existing domain provisioning UI (it polls + provisions per record).
  const callbackUrl = `${appUrl}/inboxes/new/domain?domain_ids=${encodeURIComponent(domainIdsParam)}&combined=1`;

  try {
    const { authorizationUrl, reference } = await createPaystackCheckout({
      email:       workspace?.billing_email ?? `workspace-${workspaceId}@leadash.com`,
      amountKobo:  totalKobo,
      callbackUrl,
      metadata: {
        type:              "combined_checkout",
        workspace_id:      workspaceId,
        plan_id:           plan.plan_id,
        interval:          isAnnual ? "annual" : "monthly",
        domain_record_ids: domainIdsParam,
        inbox_count:       totalInboxes,
      },
    });

    // Store the full per-domain inbox monthly price so the inbox-billing cron
    // can take over recurring hosting once the deferred plan subscription starts.
    await db.from("outreach_domains").update({
      paystack_reference:          reference,
      paystack_inbox_monthly_kobo: perDomainInboxKobo,
    }).in("id", insertedIds);

    return NextResponse.json({ domain_record_ids: insertedIds, checkout_url: authorizationUrl, reference });
  } catch (err) {
    console.error("[combined-checkout]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payment initialization failed" }, { status: 502 });
  }
}
