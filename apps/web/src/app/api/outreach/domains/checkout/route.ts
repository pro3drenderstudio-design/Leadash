import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { checkDomains } from "@/lib/outreach/porkbun";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { getUsdToNgn } from "@/lib/billing/exchangeRate";
import { createAdminClient } from "@/lib/supabase/server";

async function getDomainMarkup(): Promise<{ type: "none" | "flat" | "percent"; value: number }> {
  try {
    const adminDb = createAdminClient();
    const { data } = await adminDb
      .from("admin_settings")
      .select("key, value")
      .in("key", ["domain_markup_type", "domain_markup_value"]);
    const map = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    const type = (map.domain_markup_type as string) ?? "flat";
    const value = Number(map.domain_markup_value ?? 1);
    return { type: type as "none" | "flat" | "percent", value: Number.isFinite(value) ? value : 1 };
  } catch {
    return { type: "flat", value: 1 };
  }
}

function applyMarkup(domainPriceUsd: number, markup: { type: "none" | "flat" | "percent"; value: number }): number {
  if (markup.type === "none")    return 0;
  if (markup.type === "flat")    return markup.value;
  if (markup.type === "percent") return domainPriceUsd * (markup.value / 100);
  return 0;
}

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
    connect_only    = false,
    cf_auto         = false,
    payment_provider = "stripe",
    inbox_provider  = "postal",
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
    inbox_provider?: "postal" | "microsoft365";
  };

  if (inbox_provider !== "postal" && inbox_provider !== "microsoft365") {
    return NextResponse.json({ error: "inbox_provider must be 'postal' or 'microsoft365'" }, { status: 400 });
  }

  if (!domains?.length) return NextResponse.json({ error: "domains is required" }, { status: 400 });
  if (!mailbox_prefixes?.length || mailbox_prefixes.length > 5) {
    return NextResponse.json({ error: "mailbox_prefixes must have 1–5 entries" }, { status: 400 });
  }

  const markup = await getDomainMarkup();

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
  const ngnPerUsd     = await getUsdToNgn();

  // ── Upsert one record per domain (reuse failed/pending to avoid duplicates) ──
  const insertedIds: string[] = [];
  let totalOneTimeUsd = 0;

  for (const { domain, price: domainPrice } of domains) {
    const markupUsd = domainPrice > 0 ? applyMarkup(domainPrice, markup) : 0;
    const oneTimePriceUsd = domainPrice > 0 ? domainPrice + markupUsd : 0;
    totalOneTimeUsd += oneTimePriceUsd;

    // Reuse existing failed or pending record for same domain to avoid duplicates
    const { data: existing } = await db
      .from("outreach_domains")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("domain", domain)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let recId: string;
    if (existing) {
      await db.from("outreach_domains").update({
        status:           "pending",
        mailbox_count:    mailboxCount,
        mailbox_prefix:   mailbox_prefixes[0],
        mailbox_prefixes: mailbox_prefixes,
        first_name:       first_name ?? null,
        last_name:        last_name  ?? null,
        payment_provider,
        // Only set inbox_provider when microsoft365 — omitting it keeps the DB default ('postal')
        // so this is safe before migration 040 is applied.
        ...(inbox_provider === "microsoft365" ? { inbox_provider } : {}),
        domain_price_usd: domainPrice,
        domain_source:    domainPrice > 0 ? "leadash" : "external",
        redirect_url:     redirect_url ?? null,
        reply_forward_to: reply_forward_to ?? null,
        error_message:    null,
        updated_at:       new Date().toISOString(),
      }).eq("id", existing.id);
      recId = existing.id;
    } else {
      const { data: rec, error } = await db
        .from("outreach_domains")
        .insert({
          workspace_id:      workspaceId,
          domain,
          status:            "pending",
          mailbox_count:     mailboxCount,
          mailbox_prefix:    mailbox_prefixes[0],
          mailbox_prefixes:  mailbox_prefixes,
          first_name:        first_name ?? null,
          last_name:         last_name  ?? null,
          daily_send_limit:  30,
          payment_provider,
          ...(inbox_provider === "microsoft365" ? { inbox_provider } : {}),
          domain_price_usd:  domainPrice,
          domain_source:     domainPrice > 0 ? "leadash" : "external",
          redirect_url:      redirect_url ?? null,
          reply_forward_to:  reply_forward_to ?? null,
        })
        .select("id")
        .single();

      if (error || !rec) {
        return NextResponse.json({ error: error?.message ?? "Failed to create domain record" }, { status: 500 });
      }
      recId = rec.id;
    }
    insertedIds.push(recId);
  }

  // Use M365-specific price when inbox_provider=microsoft365
  const pricePerInboxNgn = inbox_provider === "microsoft365"
    ? ((workspacePlan as unknown as Record<string, unknown>).ms_inbox_monthly_price_ngn as number ?? 4200)
    : workspacePlan.inbox_monthly_price_ngn;
  const inboxMonthlyNgn  = pricePerInboxNgn * mailboxCount * domains.length;
  const domainIdsParam    = insertedIds.join(",");

  // Check if workspace has active inbox entitlements that cover these inboxes.
  // If covered, inbox hosting is included in their offer — charge domain cost only.
  // We still store the full monthly price on the domain so billing resumes correctly if
  // their entitlement ever expires (e.g. subscription cancelled).
  const { data: inboxEntitlements } = await db
    .from("workspace_entitlements")
    .select("quantity")
    .eq("workspace_id", workspaceId)
    .eq("entitlement_type", "inbox_credit")
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString());
  const coveredSlots           = (inboxEntitlements ?? []).reduce((s: number, e: { quantity: number | null }) => s + (e.quantity ?? 0), 0);
  const requestedInboxes       = mailboxCount * domains.length;
  const uncoveredInboxes       = Math.max(0, requestedInboxes - coveredSlots);
  // Only charge for the inboxes not covered by the entitlement (e.g. 10 credits, 15 inboxes → charge 5)
  const chargedInboxMonthlyNgn = pricePerInboxNgn * uncoveredInboxes;

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
            unit_amount: Math.round((inboxMonthlyNgn / ngnPerUsd) * 100),
            recurring:   { interval: "month" },
            product_data: {
              name:        `${inbox_provider === "microsoft365" ? "Microsoft 365" : "Sending"} inboxes (${domains.length * mailboxCount} total)`,
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
    // chargedInboxMonthlyNgn is 0 when the workspace's offer entitlement covers inbox hosting.
    // totalOneTimeUsd covers domain registration — always charged regardless of entitlements.
    const totalNgn = Math.round(totalOneTimeUsd * ngnPerUsd * 100) + Math.round(chargedInboxMonthlyNgn * 100);

    // Paystack rejects 0-amount transactions
    if (totalNgn <= 0) {
      // Mark records as paid (free provisioning) and redirect directly to provision
      await db.from("outreach_domains").update({ paystack_reference: "free" }).in("id", insertedIds);
      const successUrl = `${successBase}?domain_ids=${encodeURIComponent(domainIdsParam)}${connect_only ? "&connect=1" : ""}${cfSuffix}`;
      return NextResponse.json({ domain_record_ids: insertedIds, checkout_url: successUrl, free: true });
    }

    const { data: workspace } = await db
      .from("workspaces")
      .select("billing_email")
      .eq("id", workspaceId)
      .single();

    // Always store the FULL inbox monthly price on the domain so the billing cron
    // can charge the correct amount if entitlements ever expire.
    const inboxMonthlyKoboPerDomain = Math.round((inboxMonthlyNgn / domains.length) * 100);

    const { authorizationUrl, reference } = await createPaystackCheckout({
      email:       workspace?.billing_email ?? `workspace-${workspaceId}@leadash.com`,
      amountKobo:  totalNgn,
      callbackUrl: `${successBase}?domain_ids=${encodeURIComponent(domainIdsParam)}${connect_only ? "&connect=1" : ""}${cfSuffix}`,
      metadata:    { domain_record_ids: domainIdsParam, domain_record_id: insertedIds[0], workspace_id: workspaceId },
    });

    await db
      .from("outreach_domains")
      .update({
        paystack_reference:          reference,
        paystack_inbox_monthly_kobo: inboxMonthlyKoboPerDomain,
      })
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
