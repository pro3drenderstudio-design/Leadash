import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { purchaseDomain, type RegistrantContact } from "@/lib/outreach/porkbun";
import { registerDomain, isDomainVerified, enableDkimSigning, getSmtpCredentials } from "@/lib/outreach/ses";
import { publishDnsRecords, buildMailDnsRecords } from "@/lib/outreach/cloudflare";
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
        ...(errorMessage ? { error_message: errorMessage } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", domain_record_id);
  }

  // Fire-and-forget pipeline — respond immediately so client can start polling
  (async () => {
    try {
      // ── Step 1: Verify payment ───────────────────────────────────────────────
      const provider = domainRecord.payment_provider ?? "stripe";

      if (provider === "stripe") {
        const session_id = stripe_session_id ?? domainRecord.stripe_session_id;
        if (!session_id) throw new Error("No Stripe session ID available");
        const session = await getStripe().checkout.sessions.retrieve(session_id);
        if (session.payment_status !== "paid") throw new Error("Payment not completed");
      } else {
        const ref = paystack_reference ?? domainRecord.paystack_reference;
        if (!ref) throw new Error("No Paystack reference available");
        const { paid } = await verifyPaystackPayment(ref);
        if (!paid) throw new Error("Payment not completed");
      }

      // ── Step 2: Purchase domain via Namecheap ────────────────────────────────
      await setStatus("purchasing");

      // Fetch registrant contact from workspace settings
      const { data: wsSettings } = await db
        .from("workspace_settings")
        .select("registrant_first_name, registrant_last_name, registrant_email, registrant_phone, registrant_address, registrant_city, registrant_state, registrant_zip, registrant_country")
        .eq("workspace_id", workspaceId)
        .single();

      const registrant: RegistrantContact = {
        firstName: wsSettings?.registrant_first_name ?? "",
        lastName:  wsSettings?.registrant_last_name  ?? "",
        email:     wsSettings?.registrant_email      ?? "",
        phone:     wsSettings?.registrant_phone      ?? "",
        address:   wsSettings?.registrant_address    ?? "",
        city:      wsSettings?.registrant_city       ?? "",
        state:     wsSettings?.registrant_state      ?? "",
        zip:       wsSettings?.registrant_zip        ?? "",
        country:   wsSettings?.registrant_country    ?? "US",
      };

      if (!registrant.firstName || !registrant.email || !registrant.address) {
        throw new Error("Registrant contact info is incomplete. Please fill in your domain registrant details in Settings → Outreach.");
      }

      await purchaseDomain(domainRecord.domain, registrant);

      // ── Step 3: Register domain with SES + get DKIM tokens ──────────────────
      await setStatus("dns_pending");
      const { dkimTokens } = await registerDomain(domainRecord.domain);

      // ── Step 4: Publish DNS records via Cloudflare ──────────────────────────
      // Build SPF, DKIM CNAMEs, DMARC, and MX records
      const dnsRecords = buildMailDnsRecords(domainRecord.domain, dkimTokens);

      await publishDnsRecords(domainRecord.domain, dnsRecords);

      // Save DNS records for display in UI
      await db
        .from("outreach_domains")
        .update({ dns_records: dnsRecords })
        .eq("id", domain_record_id);

      // ── Step 5: Wait for SES domain verification (DNS propagation) ──────────
      await setStatus("verifying");

      let verified = false;
      for (let attempt = 1; attempt <= 6; attempt++) {
        await sleep(10_000); // 10s between attempts — DNS can take time
        verified = await isDomainVerified(domainRecord.domain);
        if (verified) break;
      }

      if (verified) {
        await enableDkimSigning(domainRecord.domain);
      } else {
        // Continue anyway — SES sometimes takes longer than 60s.
        // The domain will become verified in the background.
        console.warn(`[provision] SES verification still pending for ${domainRecord.domain} — continuing`);
      }

      // ── Step 6: Create inboxes ───────────────────────────────────────────────
      // SES uses shared SMTP credentials (IAM key-derived).
      // Each inbox sends FROM a different address — deliverability comes
      // from the domain's DNS records, not per-mailbox SMTP auth.
      const smtp = getSmtpCredentials();
      const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Use explicit prefixes if set (name-based), otherwise fall back to prefix+number pattern
      const explicitPrefixes: string[] | null = Array.isArray(domainRecord.mailbox_prefixes)
        ? domainRecord.mailbox_prefixes as string[]
        : null;
      const logins = explicitPrefixes
        ?? Array.from({ length: domainRecord.mailbox_count }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

      for (const login of logins) {
        const email = `${login}@${domainRecord.domain}`;

        await db.from("outreach_inboxes").insert({
          workspace_id:         workspaceId,
          domain_id:            domain_record_id,
          label:                email,
          email_address:        email,
          provider:             "smtp",
          status:               "active",
          smtp_host:            smtp.host,
          smtp_port:            smtp.port,
          smtp_user:            smtp.username,
          smtp_pass_encrypted:  encrypt(smtp.password),
          // No IMAP via SES — reply detection handled separately via SES inbound
          imap_host:            null,
          imap_port:            null,
          daily_send_limit:     15,
          warmup_enabled:       true,
          warmup_target_daily:  40,
          warmup_ramp_per_week: 5,
          warmup_ends_at:       warmupEndsAt,
          first_name:           domainRecord.first_name ?? null,
          last_name:            domainRecord.last_name  ?? null,
        });
      } // end for logins

      // ── Step 7: Mark domain active ───────────────────────────────────────────
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
  })();

  return NextResponse.json({ ok: true });
}
