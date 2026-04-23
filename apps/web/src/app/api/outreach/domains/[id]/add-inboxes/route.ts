import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { createSmtpCredential, getSmtpSettings } from "@/lib/outreach/postal";
import { createPaystackCheckout, verifyPaystackPayment } from "@/lib/billing/paystack";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { getUsdToNgn } from "@/lib/billing/exchangeRate";
import { encrypt } from "@/lib/outreach/crypto";

const MAX_INBOXES_PER_DOMAIN = 5;
const WARMUP_DAYS = 21;

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

// POST /api/outreach/domains/[id]/add-inboxes
// Body: { action: "checkout" | "provision", new_prefixes: string[], payment_provider?, stripe_session_id?, paystack_reference? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: domainId } = await params;

  const body = await req.json() as {
    action: "checkout" | "provision";
    new_prefixes: string[];
    payment_provider?: "stripe" | "paystack";
    stripe_session_id?: string;
    paystack_reference?: string;
    first_name?: string;
    last_name?: string;
  };

  const { action, new_prefixes } = body;
  if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

  // Load domain record
  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", domainId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  if (domainRecord.status !== "active") {
    return NextResponse.json({ error: "Domain must be active before adding inboxes" }, { status: 400 });
  }

  // Count existing inboxes
  const { count: existingCount } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("domain_id", domainId)
    .eq("workspace_id", workspaceId);

  const current = existingCount ?? 0;

  // ── CHECKOUT ───────────────────────────────────────────────────────────────────
  if (action === "checkout") {
    if (!new_prefixes?.length) {
      return NextResponse.json({ error: "new_prefixes is required" }, { status: 400 });
    }
    if (current + new_prefixes.length > MAX_INBOXES_PER_DOMAIN) {
      return NextResponse.json(
        { error: `Cannot add ${new_prefixes.length} inboxes — domain already has ${current} (max ${MAX_INBOXES_PER_DOMAIN})` },
        { status: 400 },
      );
    }

    // Check for prefix conflicts with existing inboxes
    const { data: existingInboxes } = await db
      .from("outreach_inboxes")
      .select("email_address")
      .eq("domain_id", domainId);

    const existingPrefixes = (existingInboxes ?? []).map(
      (i: { email_address: string }) => i.email_address.split("@")[0]?.toLowerCase()
    );
    const conflict = new_prefixes.find(p => existingPrefixes.includes(p.toLowerCase()));
    if (conflict) {
      return NextResponse.json({ error: `Prefix "${conflict}" already exists on this domain` }, { status: 400 });
    }

    const payment_provider = body.payment_provider ?? "stripe";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const { data: workspaceRow } = await db
      .from("workspaces")
      .select("plan_id")
      .eq("id", workspaceId)
      .single();

    const plan = await getPlanById(workspaceRow?.plan_id ?? "free");
    const inboxMonthlyNgn = plan.inbox_monthly_price_ngn * new_prefixes.length;
    const ngnPerUsd = await getUsdToNgn();

    // Encode new_prefixes in the success URL (safe base64)
    const prefixParam = Buffer.from(new_prefixes.join(",")).toString("base64url");
    const successUrl = `${appUrl}/inboxes?add_inboxes_domain=${domainId}&prefixes=${prefixParam}`;

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
            email: workspace?.billing_email ?? undefined,
            name:  workspace?.name ?? undefined,
            metadata: { workspace_id: workspaceId },
          });
          customerId = customer.id;
          await db.from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspaceId);
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode:     "subscription",
          line_items: [
            {
              price_data: {
                currency:    "usd",
                unit_amount: Math.round((inboxMonthlyNgn / ngnPerUsd) * 100),
                recurring:   { interval: "month" },
                product_data: {
                  name: `${new_prefixes.length} sending inbox${new_prefixes.length > 1 ? "es" : ""} on ${domainRecord.domain}`,
                },
              },
              quantity: 1,
            },
          ],
          subscription_data: {
            metadata: {
              workspace_id: workspaceId,
              domain_id: domainId,
              new_prefixes: new_prefixes.join(","),
              action: "add_inboxes",
            },
          },
          success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url:  `${appUrl}/inboxes`,
          metadata: { workspace_id: workspaceId, domain_id: domainId },
        });

        return NextResponse.json({ checkout_url: session.url });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    // Paystack
    try {
      const { data: workspace } = await db
        .from("workspaces")
        .select("billing_email")
        .eq("id", workspaceId)
        .single();

      const { authorizationUrl, reference } = await createPaystackCheckout({
        email:       workspace?.billing_email ?? `workspace-${workspaceId}@leadash.com`,
        amountKobo:  Math.round(inboxMonthlyNgn * 100),
        callbackUrl: successUrl,
        metadata:    { workspace_id: workspaceId, domain_id: domainId, new_prefixes: new_prefixes.join(",") },
      });

      return NextResponse.json({ checkout_url: authorizationUrl, reference });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── PROVISION ─────────────────────────────────────────────────────────────────
  if (action === "provision") {
    const { stripe_session_id, paystack_reference, first_name, last_name } = body;

    if (!new_prefixes?.length) {
      return NextResponse.json({ error: "new_prefixes is required" }, { status: 400 });
    }

    // Verify payment — always required on user-facing route regardless of domain payment_provider
    if (stripe_session_id) {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(stripe_session_id, { expand: ["subscription"] });
      const isPaid =
        session.payment_status === "paid" ||
        (session.mode === "subscription" &&
          (session.status === "complete" ||
            (typeof session.subscription === "object" &&
              session.subscription !== null &&
              ["active", "trialing"].includes((session.subscription as { status: string }).status))));
      if (!isPaid) return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    } else if (paystack_reference) {
      const { paid } = await verifyPaystackPayment(paystack_reference);
      if (!paid) return NextResponse.json({ error: "Payment not completed" }, { status: 402 });
    } else {
      return NextResponse.json({ error: "stripe_session_id or paystack_reference required" }, { status: 400 });
    }

    // Re-check capacity (race condition guard)
    const { count: freshCount } = await db
      .from("outreach_inboxes")
      .select("id", { count: "exact", head: true })
      .eq("domain_id", domainId)
      .eq("workspace_id", workspaceId);

    if ((freshCount ?? 0) + new_prefixes.length > MAX_INBOXES_PER_DOMAIN) {
      return NextResponse.json({ error: "Domain is at inbox capacity" }, { status: 400 });
    }

    const smtpSettings = getSmtpSettings();
    const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const created: string[] = [];

    for (const prefix of new_prefixes) {
      const email = `${prefix}@${domainRecord.domain}`;

      const cred = await createSmtpCredential(domainRecord.domain, email).catch(err => {
        throw new Error(`createSmtpCredential(${email}): ${err.message}`);
      });

      const { error: inboxError } = await db.from("outreach_inboxes").insert({
        workspace_id:         workspaceId,
        domain_id:            domainId,
        label:                email,
        email_address:        email,
        provider:             "smtp",
        status:               "active",
        smtp_host:            smtpSettings.host,
        smtp_port:            smtpSettings.port,
        smtp_user:            cred.username,
        smtp_pass_encrypted:  encrypt(cred.password),
        imap_host:            null,
        imap_port:            null,
        daily_send_limit:     1,
        warmup_current_daily: 1,
        warmup_enabled:       true,
        warmup_target_daily:  30,
        warmup_ends_at:       warmupEndsAt,
        first_name:           first_name ?? domainRecord.first_name ?? null,
        last_name:            last_name  ?? domainRecord.last_name  ?? null,
      });

      if (inboxError) {
        return NextResponse.json({ error: `Failed to create inbox ${email}: ${inboxError.message}` }, { status: 500 });
      }
      created.push(email);
    }

    // Update domain mailbox_count and mailbox_prefixes
    const allPrefixes = [
      ...(Array.isArray(domainRecord.mailbox_prefixes) ? domainRecord.mailbox_prefixes as string[] : []),
      ...new_prefixes,
    ];
    await db
      .from("outreach_domains")
      .update({ mailbox_count: allPrefixes.length, mailbox_prefixes: allPrefixes, updated_at: new Date().toISOString() })
      .eq("id", domainId);

    return NextResponse.json({ ok: true, created, count: created.length });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
