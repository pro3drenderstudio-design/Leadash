import type { Job } from "bullmq";
import { adminClient } from "../lib/supabase";
import { updateNameservers } from "../lib/porkbun";
import {
  registerDomain,
  isDomainVerified,
  createSmtpCredential,
  getSmtpSettings,
  createInboundRoute,
} from "../lib/postal";
import {
  addZone,
  publishDnsRecords,
  buildPostalMailDnsRecords,
  setWebRedirect,
  setEmailForwarding,
} from "../lib/cloudflare";
import { encrypt } from "../lib/crypto";

const WARMUP_DAYS = 21;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface ProvisionJobData {
  domain_record_id: string;
  workspace_id:     string;
}

export async function processProvision(job: Job<ProvisionJobData>) {
  const { domain_record_id, workspace_id } = job.data;
  const db = adminClient();

  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", domain_record_id)
    .eq("workspace_id", workspace_id)
    .single();

  if (!domainRecord) throw new Error(`Domain record ${domain_record_id} not found`);
  if (domainRecord.status === "active") return; // already done

  async function setStatus(status: string, errorMessage?: string) {
    await db
      .from("outreach_domains")
      .update({
        status,
        error_message: errorMessage ?? null,
        updated_at:    new Date().toISOString(),
      })
      .eq("id", domain_record_id);
  }

  // ── Step 1: Register domain with Postal + get DKIM public key ──────────────
  // (purchaseDomain is handled by the Vercel provision route — Porkbun blocks VPS IPs)
  await setStatus("dns_pending");
  const postalDomain = await registerDomain(domainRecord.domain)
    .catch(e => { throw new Error(`Postal registerDomain: ${e.message}`); });

  // ── Step 3: Add zone to Cloudflare + point Porkbun nameservers ───────────────
  await sleep(5_000);
  const { nameservers } = await addZone(domainRecord.domain)
    .catch(e => { throw new Error(`CF addZone: ${e.message}`); });
  await updateNameservers(domainRecord.domain, nameservers)
    .catch(e => { throw new Error(`Porkbun updateNameservers: ${e.message}`); });

  // ── Step 4: Publish DNS records via Cloudflare ──────────────────────────────
  const postalIp = process.env.POSTAL_SERVER_IP ?? "";
  if (!postalIp) throw new Error("POSTAL_SERVER_IP env var is not set");
  const dnsRecords = buildPostalMailDnsRecords(
    domainRecord.domain,
    postalIp,
    postalDomain.dkim_public_key,
  );
  await publishDnsRecords(domainRecord.domain, dnsRecords)
    .catch(e => { throw new Error(`CF publishDnsRecords: ${e.message}`); });

  await db.from("outreach_domains").update({ dns_records: dnsRecords }).eq("id", domain_record_id);

  // ── Step 4b: Optional web redirect + email forwarding ────────────────────────
  if (domainRecord.redirect_url) {
    await setWebRedirect(domainRecord.domain, domainRecord.redirect_url).catch(err => {
      console.warn(`[provision] setWebRedirect failed (non-fatal):`, err instanceof Error ? err.message : err);
    });
  }
  if (domainRecord.reply_forward_to) {
    await setEmailForwarding(domainRecord.domain, domainRecord.reply_forward_to).catch(err => {
      console.warn(`[provision] setEmailForwarding failed (non-fatal):`, err instanceof Error ? err.message : err);
    });
    await db.from("outreach_domains").update({ forward_verified: false }).eq("id", domain_record_id);
  }

  // ── Step 5: Wait for DKIM DNS propagation ───────────────────────────────────
  await setStatus("verifying");
  let verified = false;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await sleep(10_000);
    verified = await isDomainVerified(domainRecord.domain);
    if (verified) break;
  }
  if (!verified) {
    console.warn(`[provision] DKIM not yet visible for ${domainRecord.domain} — continuing`);
  }

  // ── Step 6: Create per-mailbox Postal SMTP credentials + inboxes ─────────────
  const smtpSettings = getSmtpSettings();
  const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const explicitPrefixes: string[] | null = Array.isArray(domainRecord.mailbox_prefixes)
    ? domainRecord.mailbox_prefixes as string[]
    : null;
  const logins = explicitPrefixes
    ?? Array.from({ length: domainRecord.mailbox_count }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

  for (const login of logins) {
    const email = `${login}@${domainRecord.domain}`;
    const cred = await createSmtpCredential(domainRecord.domain, email)
      .catch(e => { throw new Error(`Postal createSmtpCredential(${email}): ${e.message}`); });

    const { error: inboxError } = await db.from("outreach_inboxes").insert({
      workspace_id:         workspace_id,
      domain_id:            domain_record_id,
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
      daily_send_limit:      1,
      warmup_enabled:        true,
      warmup_current_daily:  1,
      warmup_target_daily:   30,
      warmup_ends_at:        warmupEndsAt,
      first_name:           domainRecord.first_name ?? null,
      last_name:            domainRecord.last_name  ?? null,
    });
    if (inboxError) throw new Error(`Failed to create inbox ${email}: ${inboxError.message}`);
  }

  // ── Step 7: Register inbound route in Postal ─────────────────────────────────
  const appUrl = process.env.APP_URL ?? "https://leadash.com";
  await createInboundRoute(domainRecord.domain, `${appUrl}/api/outreach/inbound`).catch(err => {
    console.warn(`[provision] createInboundRoute failed (non-fatal):`, err instanceof Error ? err.message : err);
  });

  // ── Step 8: Mark domain active ───────────────────────────────────────────────
  await db
    .from("outreach_domains")
    .update({
      status:         "active",
      warmup_ends_at: warmupEndsAt,
      updated_at:     new Date().toISOString(),
    })
    .eq("id", domain_record_id);

  console.log(`[provision] Done: ${domainRecord.domain}`);
}
