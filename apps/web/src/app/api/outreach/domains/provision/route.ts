import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { purchaseDomain, setDnsHosts } from "@/lib/outreach/namecheap";
import { addDomain, verifyDomain, createSmtpCredential, getSmtpSettings, generatePassword } from "@/lib/outreach/mailgun";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { encrypt } from "@/lib/outreach/crypto";
import type { DnsRecord } from "@/lib/outreach/namecheap";

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
    domain_record_id:   string;
    stripe_session_id?: string;
    paystack_reference?: string;
  };

  if (!domain_record_id) {
    return NextResponse.json({ error: "domain_record_id is required" }, { status: 400 });
  }

  // ── Fetch domain record ──────────────────────────────────────────────────────
  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", domain_record_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) {
    return NextResponse.json({ error: "Domain record not found" }, { status: 404 });
  }

  // Already provisioned — idempotent
  if (domainRecord.status === "active") {
    return NextResponse.json({ ok: true, status: "active" });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
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

  // Run the pipeline asynchronously — respond immediately after payment verify
  // so the client can start polling.
  (async () => {
    try {
      // ── Step 1: Verify payment ─────────────────────────────────────────────
      const provider = domainRecord.payment_provider ?? "stripe";

      if (provider === "stripe") {
        const session_id = stripe_session_id ?? domainRecord.stripe_session_id;
        if (!session_id) throw new Error("No Stripe session ID available");
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (session.payment_status !== "paid") {
          throw new Error("Payment not completed");
        }
      } else {
        const ref = paystack_reference ?? domainRecord.paystack_reference;
        if (!ref) throw new Error("No Paystack reference available");
        const { paid } = await verifyPaystackPayment(ref);
        if (!paid) throw new Error("Payment not completed");
      }

      // ── Step 2: Purchase domain ────────────────────────────────────────────
      await setStatus("purchasing");
      await purchaseDomain(domainRecord.domain);

      // ── Step 3: Add domain to Mailgun ──────────────────────────────────────
      await setStatus("dns_pending");
      const { sendingRecords, receivingRecords } = await addDomain(domainRecord.domain);

      // Save DNS records for display
      await db
        .from("outreach_domains")
        .update({ dns_records: { sending: sendingRecords, receiving: receivingRecords } })
        .eq("id", domain_record_id);

      // ── Step 4: Publish DNS records via Namecheap ──────────────────────────
      const dmarcRecord: DnsRecord = {
        type:  "TXT",
        name:  "_dmarc",
        value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domainRecord.domain}; pct=100`,
        ttl:   1800,
      };

      const allRecords: DnsRecord[] = [
        ...sendingRecords,
        ...receivingRecords,
        dmarcRecord,
      ];

      await setDnsHosts(domainRecord.domain, allRecords);

      // ── Step 5: Verify domain with Mailgun (retry up to 3×) ────────────────
      await setStatus("verifying");
      let verified = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await sleep(5_000);
        const result = await verifyDomain(domainRecord.domain);
        if (result.valid) { verified = true; break; }
      }
      // Continue even if not verified yet — DNS propagation can take time.
      // The status stays active; the user can re-trigger verification later.
      if (!verified) {
        console.warn(`[provision] Mailgun verification pending for ${domainRecord.domain} — DNS may not have propagated yet`);
      }

      // ── Step 6: Create SMTP credentials + inboxes ─────────────────────────
      const smtp = getSmtpSettings();
      const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

      for (let i = 1; i <= domainRecord.mailbox_count; i++) {
        const login    = `${domainRecord.mailbox_prefix}${i}`;
        const email    = `${login}@${domainRecord.domain}`;
        const password = generatePassword(24);

        await createSmtpCredential(domainRecord.domain, login, password);

        await db.from("outreach_inboxes").insert({
          workspace_id:         workspaceId,
          domain_id:            domain_record_id,
          label:                email,
          email_address:        email,
          provider:             "smtp",
          status:               "active",
          smtp_host:            smtp.host,
          smtp_port:            smtp.port,
          smtp_user:            email,
          smtp_pass_encrypted:  encrypt(password),
          imap_host:            smtp.imapHost,
          imap_port:            smtp.imapPort,
          daily_send_limit:     15,
          warmup_enabled:       true,
          warmup_target_daily:  40,
          warmup_ramp_per_week: 5,
          first_name:           domainRecord.first_name ?? null,
          last_name:            domainRecord.last_name  ?? null,
        });
      }

      // ── Step 7: Mark domain active ─────────────────────────────────────────
      await db
        .from("outreach_domains")
        .update({
          status:        "active",
          warmup_ends_at: warmupEndsAt,
          updated_at:    new Date().toISOString(),
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
