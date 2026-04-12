import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackSignature, verifyPaystackPayment } from "@/lib/billing/paystack";
import { purchaseDomain, type RegistrantContact } from "@/lib/outreach/porkbun";
import { registerDomain, isDomainVerified, enableDkimSigning, getSmtpCredentials } from "@/lib/outreach/ses";
import { publishDnsRecords, buildMailDnsRecords } from "@/lib/outreach/cloudflare";
import { encrypt } from "@/lib/outreach/crypto";

const WARMUP_DAYS = 21;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
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

  const reference      = event.data.reference;
  const meta           = event.data.metadata ?? {};
  const domainRecordId = meta.domain_record_id as string | undefined;
  const workspaceId    = meta.workspace_id     as string | undefined;

  if (!domainRecordId || !workspaceId) {
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

  const { paid } = await verifyPaystackPayment(reference);
  if (!paid) return NextResponse.json({ received: true });

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
      throw new Error("Registrant contact info is incomplete. Please fill in Settings → Outreach.");
    }

    await purchaseDomain(domainRecord.domain, registrant);

    await setStatus("dns_pending");
    const { dkimTokens } = await registerDomain(domainRecord.domain);

    const dnsRecords = buildMailDnsRecords(domainRecord.domain, dkimTokens);
    await publishDnsRecords(domainRecord.domain, dnsRecords);

    await db
      .from("outreach_domains")
      .update({ dns_records: dnsRecords })
      .eq("id", domainRecordId);

    await setStatus("verifying");
    let verified = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      await sleep(10_000);
      verified = await isDomainVerified(domainRecord.domain);
      if (verified) break;
    }
    if (verified) await enableDkimSigning(domainRecord.domain);

    const smtp = getSmtpCredentials();
    const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const explicitPrefixes: string[] | null = Array.isArray(domainRecord.mailbox_prefixes)
      ? domainRecord.mailbox_prefixes as string[]
      : null;
    const logins = explicitPrefixes
      ?? Array.from({ length: domainRecord.mailbox_count }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

    for (const login of logins) {
      const email = `${login}@${domainRecord.domain}`;

      await db.from("outreach_inboxes").insert({
        workspace_id:         workspaceId,
        domain_id:            domainRecordId,
        label:                email,
        email_address:        email,
        provider:             "smtp",
        status:               "active",
        smtp_host:            smtp.host,
        smtp_port:            smtp.port,
        smtp_user:            smtp.username,
        smtp_pass_encrypted:  encrypt(smtp.password),
        imap_host:            null,
        imap_port:            null,
        daily_send_limit:     30,
        warmup_enabled:       true,
        warmup_target_daily:  30,
        warmup_ramp_per_week: 3,
        warmup_ends_at:       warmupEndsAt,
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
