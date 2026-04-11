import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { checkDomains } from "@/lib/outreach/namecheap";
import { createPaystackCheckout } from "@/lib/billing/paystack";

// $2 per inbox per month (recurring)
const INBOX_MONTHLY_PRICE_USD = 2;
// $1 service fee on top of the at-cost domain price
const DOMAIN_SERVICE_FEE_USD = 1;
// Approximate NGN/USD exchange rate — update periodically or fetch live
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
    domain,
    mailbox_count,
    mailbox_prefix = "outreach",
    first_name,
    last_name,
    payment_provider = "stripe",
  } = body as {
    domain: string;
    mailbox_count: number;
    mailbox_prefix?: string;
    first_name?: string;
    last_name?: string;
    payment_provider?: "stripe" | "paystack";
  };

  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  if (!mailbox_count || mailbox_count < 1 || mailbox_count > 5) {
    return NextResponse.json({ error: "mailbox_count must be between 1 and 5" }, { status: 400 });
  }

  // ── Get domain price from Namecheap ─────────────────────────────────────────
  let domainPrice = 10.98; // fallback
  try {
    const [check] = await checkDomains([domain]);
    if (!check?.available) {
      return NextResponse.json({ error: "Domain is not available for purchase" }, { status: 409 });
    }
    domainPrice = check.price;
  } catch {
    // If Namecheap check fails, proceed with fallback — provision step will catch real errors
  }

  const oneTimePriceUsd   = domainPrice + DOMAIN_SERVICE_FEE_USD;
  const recurringPriceUsd = INBOX_MONTHLY_PRICE_USD * mailbox_count;

  // ── Insert pending domain record ─────────────────────────────────────────────
  const { data: domainRecord, error: insertError } = await db
    .from("outreach_domains")
    .insert({
      workspace_id:     workspaceId,
      domain,
      status:           "pending",
      mailbox_count,
      mailbox_prefix,
      first_name:       first_name ?? null,
      last_name:        last_name  ?? null,
      daily_send_limit: 15,
      payment_provider,
    })
    .select()
    .single();

  if (insertError || !domainRecord) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create domain record" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── Stripe ───────────────────────────────────────────────────────────────────
  if (payment_provider === "stripe") {
    const stripe = getStripe();

    // Resolve or create Stripe customer for this workspace
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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode:     "payment",
      line_items: [
        {
          price_data: {
            currency:     "usd",
            unit_amount:  Math.round(oneTimePriceUsd * 100),
            product_data: {
              name:        `Domain: ${domain} (1 yr)`,
              description: "Includes domain registration + DNS setup",
            },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency:    "usd",
            unit_amount: Math.round(recurringPriceUsd * 100),
            recurring:   { interval: "month" },
            product_data: {
              name:        `Sending inboxes: ${domain}`,
              description: `${mailbox_count} inbox${mailbox_count > 1 ? "es" : ""} × $${INBOX_MONTHLY_PRICE_USD}/mo`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: { domain_record_id: domainRecord.id, workspace_id: workspaceId },
      },
      subscription_data: {
        metadata: { domain_record_id: domainRecord.id, workspace_id: workspaceId },
      },
      success_url: `${appUrl}/inboxes/new/domain?domain_id=${domainRecord.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/inboxes/new`,
      metadata:    { domain_record_id: domainRecord.id, workspace_id: workspaceId },
    });

    await db
      .from("outreach_domains")
      .update({ stripe_session_id: session.id })
      .eq("id", domainRecord.id);

    return NextResponse.json({ domain_record_id: domainRecord.id, checkout_url: session.url });
  }

  // ── Paystack ─────────────────────────────────────────────────────────────────
  const totalNgn = Math.round((oneTimePriceUsd + recurringPriceUsd) * NGN_PER_USD * 100); // kobo

  const { data: workspace } = await db
    .from("workspaces")
    .select("billing_email")
    .eq("id", workspaceId)
    .single();

  const { authorizationUrl, reference } = await createPaystackCheckout({
    email:       workspace?.billing_email ?? `workspace-${workspaceId}@leadash.io`,
    amountKobo:  totalNgn,
    callbackUrl: `${appUrl}/inboxes/new/domain?domain_id=${domainRecord.id}&ref=${encodeURIComponent("")}`,
    metadata:    { domain_record_id: domainRecord.id, workspace_id: workspaceId },
  });

  await db
    .from("outreach_domains")
    .update({ paystack_reference: reference })
    .eq("id", domainRecord.id);

  return NextResponse.json({
    domain_record_id: domainRecord.id,
    checkout_url: authorizationUrl,
    reference,
  });
}
