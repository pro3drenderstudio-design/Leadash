import { NextRequest, NextResponse, after } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { purchaseDomain, updateNameservers } from "@/lib/outreach/porkbun";
import { registerDomain, isDomainVerified, createSmtpCredential, getSmtpSettings, createInboundRoute } from "@/lib/outreach/postal";
import { addZone, publishDnsRecords, buildPostalMailDnsRecords, setWebRedirect, setEmailForwarding } from "@/lib/outreach/cloudflare";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { encrypt } from "@/lib/outreach/crypto";

const WARMUP_DAYS = 21;

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { domain_record_id, stripe_session_id, paystack_reference } = await req.json() as {
    domain_record_id:    string;
    stripe_session_id?:  string;
    paystack_reference?: string;
  };

  if (!domain_record_id) {
    return NextResponse.json({ error: "domain_record_id is required" }, { status: 400 });
  }

  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", domain_record_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) {
    return NextResponse.json({ error: "Domain record not found" }, { status: 404 });
  }

  // Idempotent — already provisioned
  if (domainRecord.status === "active") {
    return NextResponse.json({ ok: true, status: "active" });
  }

  async function setStatus(status: string, errorMessage?: string) {
    await db
      .from("outreach_domains")
      .update({
        status,
        error_message: errorMessage ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain_record_id);
  }

  // Run pipeline after response is sent — keeps the serverless function alive
  after(async () => {
    try {
      // ── Step 1: Verify payment ───────────────────────────────────────────────
      const provider = domainRecord.payment_provider ?? "stripe";

      if (provider === "stripe") {
        const session_id = stripe_session_id ?? domainRecord.stripe_session_id;
        if (!session_id) throw new Error("No Stripe session ID available");
        const session = await getStripe().checkout.sessions.retrieve(session_id, { expand: ["subscription"] });
        // subscription mode: payment_status is "no_payment_required" but subscription should be active/trialing
        const isPaid =
          session.payment_status === "paid" ||
          (session.mode === "subscription" &&
            (session.status === "complete" ||
              (typeof session.subscription === "object" &&
                session.subscription !== null &&
                ["active", "trialing"].includes((session.subscription as { status: string }).status))));
        if (!isPaid) throw new Error("Payment not completed");
      } else {
        const ref = paystack_reference ?? domainRecord.paystack_reference;
        if (!ref) throw new Error("No Paystack reference available");
        // "free" is a sentinel value for 0-amount checkouts (skipped payment)
        if (ref !== "free") {
          const { paid } = await verifyPaystackPayment(ref);
          if (!paid) throw new Error("Payment not completed");
        }
      }

      // ── Step 2: Purchase domain via Porkbun ──────────────────────────────────
      await setStatus("purchasing");
      await purchaseDomain(domainRecord.domain, undefined, domainRecord.domain_price_usd ?? undefined);

      // ── Step 3: Register domain with Postal + get DKIM public key ───────────
      await setStatus("dns_pending");
      const postalDomain = await registerDomain(domainRecord.domain)
        .catch(e => { throw new Error(`Postal registerDomain: ${e.message}`); });

      // ── Step 3b: Add zone to Cloudflare + point Porkbun nameservers ──────────
      // Brief pause — Porkbun needs a few seconds after purchase before accepting NS updates
      await sleep(5_000);
      const { nameservers } = await addZone(domainRecord.domain)
        .catch(e => { throw new Error(`CF addZone: ${e.message}`); });
      await updateNameservers(domainRecord.domain, nameservers)
        .catch(e => { throw new Error(`Porkbun updateNameservers: ${e.message}`); });

      // ── Step 4: Publish DNS records via Cloudflare ──────────────────────────
      const postalIp = process.env.POSTAL_SERVER_IP ?? "";
      if (!postalIp) throw new Error("POSTAL_SERVER_IP env var is not set");
      const dnsRecords = buildPostalMailDnsRecords(
        domainRecord.domain,
        postalIp,
        postalDomain.dkim_public_key,
      );
      await publishDnsRecords(domainRecord.domain, dnsRecords)
        .catch(e => { throw new Error(`CF publishDnsRecords: ${e.message}`); });

      // Save DNS records for display in UI
      await db
        .from("outreach_domains")
        .update({ dns_records: dnsRecords })
        .eq("id", domain_record_id);

      // ── Step 4b: Optional web redirect + email forwarding ────────────────
      if (domainRecord.redirect_url) {
        try {
          await setWebRedirect(domainRecord.domain, domainRecord.redirect_url);
        } catch (err) {
          console.warn(`[provision] setWebRedirect failed (non-fatal):`, err instanceof Error ? err.message : err);
        }
      }
      if (domainRecord.reply_forward_to) {
        try {
          await setEmailForwarding(domainRecord.domain, domainRecord.reply_forward_to);
          await db.from("outreach_domains").update({ forward_verified: false }).eq("id", domain_record_id);
        } catch (err) {
          console.warn(`[provision] setEmailForwarding failed (non-fatal):`, err instanceof Error ? err.message : err);
        }
      }

      // ── Step 5: Wait for DKIM DNS propagation ───────────────────────────────
      await setStatus("verifying");

      let verified = false;
      for (let attempt = 1; attempt <= 6; attempt++) {
        await sleep(10_000); // 10s between attempts
        verified = await isDomainVerified(domainRecord.domain);
        if (verified) break;
      }

      if (!verified) {
        // DNS can take longer — continue anyway, sending will work once DKIM propagates
        console.warn(`[provision] DKIM not yet visible for ${domainRecord.domain} — continuing`);
      }

      // ── Step 6: Create per-mailbox Postal SMTP credentials + inboxes ─────────
      const smtpSettings = getSmtpSettings();
      const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const explicitPrefixes: string[] | null = Array.isArray(domainRecord.mailbox_prefixes)
        ? domainRecord.mailbox_prefixes as string[]
        : null;
      const logins = explicitPrefixes
        ?? Array.from({ length: domainRecord.mailbox_count }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

      for (const login of logins) {
        const email = `${login}@${domainRecord.domain}`;

        // Each mailbox gets its own Postal SMTP credential
        const cred = await createSmtpCredential(domainRecord.domain, email)
          .catch(e => { throw new Error(`Postal createSmtpCredential(${email}): ${e.message}`); });

        const { error: inboxError } = await db.from("outreach_inboxes").insert({
          workspace_id:         workspaceId,
          domain_id:            domain_record_id,
          label:                email,
          email_address:        email,
          provider:             "smtp",
          status:               "active",
          smtp_host:            smtpSettings.host,
          smtp_port:            smtpSettings.port,
          smtp_user:            cred.username,
          smtp_pass_encrypted:  encrypt(cred.password),
          imap_host:            null, // SES handles inbound replies
          imap_port:            null,
          daily_send_limit:     30,
          warmup_enabled:       true,
          warmup_target_daily:  30,
          warmup_ramp_per_week: 3,
          warmup_ends_at:       warmupEndsAt,
          first_name:           domainRecord.first_name ?? null,
          last_name:            domainRecord.last_name  ?? null,
        });
        if (inboxError) throw new Error(`Failed to create inbox ${email}: ${inboxError.message}`);
      } // end for logins

      // ── Step 7: Register inbound route in Postal ─────────────────────────────
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      try {
        await createInboundRoute(domainRecord.domain, `${appUrl}/api/outreach/inbound`);
      } catch (err) {
        console.warn(`[provision] createInboundRoute failed (non-fatal):`, err instanceof Error ? err.message : err);
      }

      // ── Step 8: Mark domain active ───────────────────────────────────────────
      await db
        .from("outreach_domains")
        .update({
          status:         "active",
          warmup_ends_at: warmupEndsAt,
          updated_at:     new Date().toISOString(),
        })
        .eq("id", domain_record_id);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[provision] Failed for domain ${domainRecord.domain}:`, msg);
      await setStatus("failed", msg);
    }
  });

  return NextResponse.json({ ok: true });
}
