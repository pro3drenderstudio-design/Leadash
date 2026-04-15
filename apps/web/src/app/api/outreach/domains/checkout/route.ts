import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { checkDomains } from "@/lib/outreach/porkbun";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";

// $1 service fee on top of the at-cost domain price
const DOMAIN_SERVICE_FEE_USD = 1;
// Approximate NGN/USD exchange rate for domain cost conversion only
const NGN_PER_USD = 1600;

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, userId, db } = auth;

  const body = await req.json();
  const {
    domains,           // [{ domain, price }]
    mailbox_prefixes,  // explicit local-parts e.g. ["john","j.smith"]
    first_name,
    last_name,
    redirect_url,
    reply_forward_to,
    connect_only = false,
    cf_auto = false,
    payment_provider = "stripe",
  } = body as {
    domains: Array<{ domain: string; price: number }>;
    mailbox_prefixes: string[];
    first_name?: string;
    last_name?: string;
    redirect_url?: string;
    reply_forward_to?: string;
    connect_only?: boolean;
    cf_auto?: boolean;
    payment_provider?: "stripe" | "paystack";
  };

  if (!domains?.length) return NextResponse.json({ error: "domains is required" }, { status: 400 });
  if (!mailbox_prefixes?.length || mailbox_prefixes.length > 5) {
    return NextResponse.json({ error: "mailbox_prefixes must have 1–5 entries" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const mailboxCount = mailbox_prefixes.length;
  const cfSuffix    = connect_only && cf_auto ? "&cf=1" : "";
  const successBase = connect_only ? `${appUrl}/inboxes/new/connect-domain` : `${appUrl}/inboxes/new/domain`;

  // Fetch workspace plan to get inbox_monthly_price_ngn
  const { data: workspace_plan_row } = await db
    .from("workspaces")
    .select("plan_id")
    .eq("id", workspaceId)
    .single();
  const workspacePlan = await getPlanById(workspace_plan_row?.plan_id ?? "free");

  // ── Insert one pending record per domain ─────────────────────────────────────
  const insertedIds: string[] = [];
  let totalOneTimeUsd = 0;

  for (const { domain, price: domainPrice } of domains) {
    const oneTimePriceUsd = domainPrice + DOMAIN_SERVICE_FEE_USD;
    totalOneTimeUsd += oneTimePriceUsd;

    const { data: rec, error } = await db
      .from("outreach_domains")
      .insert({
        workspace_id:      workspaceId,
        domain,
        status:            "pending",
        mailbox_count:     mailboxCount,
        mailbox_prefix:    mailbox_prefixes[0], // fallback
        mailbox_prefixes:  mailbox_prefixes,
        first_name:        first_name ?? null,
        last_name:         last_name  ?? null,
        daily_send_limit:  15,
        payment_provider,
        domain_price_usd:  domainPrice,
        redirect_url:      redirect_url ?? null,
        reply_forward_to:  reply_forward_to ?? null,
      })
      .select("id")
      .single();

    if (error || !rec) {
      return NextResponse.json({ error: error?.message ?? "Failed to create domain record" }, { status: 500 });
    }
    insertedIds.push(rec.id);
  }

  // inbox_monthly_price_ngn from plan config (already in NGN, per mailbox)
  const inboxMonthlyNgn   = workspacePlan.inbox_monthly_price_ngn * mailboxCount * domains.length;
  const domainIdsParam    = insertedIds.join(",");

  // ── Stripe ───────────────────────────────────────────────────────────────────
  if (payment_provider === "stripe") {
    try {
      const stripe = getStripe();

      const { data: workspace } = await db
        .from("workspaces")
        .select("stripe_customer_id, billing_email, name")
        .eq("id", workspaceId)
        .single();

      let customerId = workspace?.stripe_customer_id as string | undefined;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email:    workspace?.billing_email ?? undefined,
          name:     workspace?.name ?? undefined,
          metadata: { workspace_id: workspaceId },
        });
        customerId = customer.id;
        await db.from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspaceId);
      }

      const domainNames = domains.map(d => d.domain).join(", ");

      // Stripe subscription mode: non-recurring line items are billed once on the first invoice.
      type LineItem = { price_data: { currency: string; unit_amount: number; recurring?: { interval: "day" | "week" | "month" | "year" }; product_data: { name: string; description?: string } }; quantity: number };
      const lineItems: LineItem[] = [
        {
          price_data: {
            currency:    "usd",
            unit_amount: Math.round((inboxMonthlyNgn / NGN_PER_USD) * 100),
            recurring:   { interval: "month" },
            product_data: {
              name:        `Sending inboxes (${domains.length * mailboxCount} total)`,
              description: `${domains.length} domain${domains.length > 1 ? "s" : ""} × ${mailboxCount} inbox${mailboxCount > 1 ? "es" : ""}/mo`,
            },
          },
          quantity: 1,
        },
      ];

      if (totalOneTimeUsd > 0) {
        lineItems.push({
          price_data: {
            currency:     "usd",
            unit_amount:  Math.round(totalOneTimeUsd * 100),
            product_data: { name: `Domain setup: ${domainNames}` },
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode:     "subscription",
        line_items: lineItems,
        subscription_data:   { metadata: { domain_record_ids: domainIdsParam, workspace_id: workspaceId } },
        success_url: `${successBase}?domain_ids=${encodeURIComponent(domainIdsParam)}&session_id={CHECKOUT_SESSION_ID}${connect_only ? "&connect=1" : ""}${cfSuffix}`,
        cancel_url:  `${appUrl}/inboxes/new`,
        metadata:    { domain_record_ids: domainIdsParam, workspace_id: workspaceId },
      });

      await db
        .from("outreach_domains")
        .update({ stripe_session_id: session.id })
        .in("id", insertedIds);

      return NextResponse.json({ domain_record_ids: insertedIds, checkout_url: session.url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[checkout] Stripe error:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Paystack ─────────────────────────────────────────────────────────────────
  try {
    // Domain cost in NGN (converted from USD) + inbox monthly cost (already in NGN from plan)
    const totalNgn = Math.round(totalOneTimeUsd * NGN_PER_USD * 100) + inboxMonthlyNgn * 100;

    const { data: workspace } = await db
      .from("workspaces")
      .select("billing_email")
      .eq("id", workspaceId)
      .single();

    const { authorizationUrl, reference } = await createPaystackCheckout({
      email:       workspace?.billing_email ?? `workspace-${workspaceId}@leadash.com`,
      amountKobo:  totalNgn,
      callbackUrl: `${successBase}?domain_ids=${encodeURIComponent(domainIdsParam)}${connect_only ? "&connect=1" : ""}${cfSuffix}`,
      metadata:    { domain_record_ids: domainIdsParam, workspace_id: workspaceId },
    });

    await db
      .from("outreach_domains")
      .update({ paystack_reference: reference })
      .in("id", insertedIds);

    return NextResponse.json({
      domain_record_ids: insertedIds,
      checkout_url: authorizationUrl,
      reference,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[checkout] Paystack error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
