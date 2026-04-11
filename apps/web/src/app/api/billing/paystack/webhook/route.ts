import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackSignature, verifyPaystackPayment } from "@/lib/billing/paystack";
import { purchaseDomain, setDnsHosts } from "@/lib/outreach/namecheap";
import { addDomain, verifyDomain, createSmtpCredential, getSmtpSettings, generatePassword } from "@/lib/outreach/mailgun";
import { encrypt } from "@/lib/outreach/crypto";
import type { DnsRecord } from "@/lib/outreach/namecheap";

const WARMUP_DAYS = 21;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event: string; data: { reference: string; metadata?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const reference        = event.data.reference;
  const meta             = event.data.metadata ?? {};
  const domainRecordId   = meta.domain_record_id as string | undefined;
  const workspaceId      = meta.workspace_id     as string | undefined;

  if (!domainRecordId || !workspaceId) {
    // Not a domain purchase event — ignore
    return NextResponse.json({ received: true });
  }

  const db = createAdminClient();

  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", domainRecordId)
    .single();

  if (!domainRecord || domainRecord.status === "active") {
    return NextResponse.json({ received: true });
  }

  // Verify payment server-side
  const { paid } = await verifyPaystackPayment(reference);
  if (!paid) return NextResponse.json({ received: true });

  // Run provision pipeline (same logic as the provision route)
  async function setStatus(status: string, errorMessage?: string) {
    await db
      .from("outreach_domains")
      .update({
        status,
        ...(errorMessage ? { error_message: errorMessage } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", domainRecordId!);
  }

  try {
    await setStatus("purchasing");
    await purchaseDomain(domainRecord.domain);

    await setStatus("dns_pending");
    const { sendingRecords, receivingRecords } = await addDomain(domainRecord.domain);

    await db
      .from("outreach_domains")
      .update({ dns_records: { sending: sendingRecords, receiving: receivingRecords } })
      .eq("id", domainRecordId);

    const dmarcRecord: DnsRecord = {
      type:  "TXT",
      name:  "_dmarc",
      value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${domainRecord.domain}; pct=100`,
      ttl:   1800,
    };
    await setDnsHosts(domainRecord.domain, [...sendingRecords, ...receivingRecords, dmarcRecord]);

    await setStatus("verifying");
    for (let attempt = 1; attempt <= 3; attempt++) {
      await sleep(5_000);
      const result = await verifyDomain(domainRecord.domain);
      if (result.valid) break;
    }

    const smtp = getSmtpSettings();
    const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

    for (let i = 1; i <= domainRecord.mailbox_count; i++) {
      const login    = `${domainRecord.mailbox_prefix}${i}`;
      const email    = `${login}@${domainRecord.domain}`;
      const password = generatePassword(24);

      await createSmtpCredential(domainRecord.domain, login, password);

      await db.from("outreach_inboxes").insert({
        workspace_id:         workspaceId,
        domain_id:            domainRecordId,
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

    await db
      .from("outreach_domains")
      .update({ status: "active", warmup_ends_at: warmupEndsAt, updated_at: new Date().toISOString() })
      .eq("id", domainRecordId);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[paystack-webhook] Provision failed for ${domainRecord.domain}:`, msg);
    await setStatus("failed", msg);
  }

  return NextResponse.json({ received: true });
}
