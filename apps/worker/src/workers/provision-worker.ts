import type { Job } from "bullmq";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../lib/supabase";
import { purchaseDomain as purchaseDomainNamecheap, updateNameservers as updateNameserversNamecheap } from "../lib/namecheap";
import { purchaseDomain as purchaseDomainPorkbun, updateNameservers as updateNameserversPorkbun } from "../lib/porkbun";

async function getRegistrar(): Promise<"namecheap" | "porkbun"> {
  try {
    const db = adminClient();
    const { data } = await db.from("admin_settings").select("value").eq("key", "domain_registrar").maybeSingle();
    const val = data?.value as string | undefined;
    return val === "porkbun" ? "porkbun" : "namecheap";
  } catch { return "namecheap"; }
}

type RegistrantInfo = Parameters<typeof purchaseDomainNamecheap>[1];

async function purchaseDomain(domain: string, registrant: RegistrantInfo): Promise<void> {
  const r = await getRegistrar();
  if (r === "porkbun") return purchaseDomainPorkbun(domain);
  return purchaseDomainNamecheap(domain, registrant!);
}

async function updateNameservers(domain: string, nameservers: string[]): Promise<void> {
  const r = await getRegistrar();
  if (r === "porkbun") return updateNameserversPorkbun(domain, nameservers);
  return updateNameserversNamecheap(domain, nameservers);
}
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
  buildMicrosoftHybridDnsRecords,
  setWebRedirect,
  setEmailForwarding,
} from "../lib/cloudflare";
import { encrypt } from "../lib/crypto";

const WARMUP_DAYS    = 21;
const MS_WARMUP_DAYS = 14;

const OWNER_EMAIL = process.env.OWNER_ALERT_EMAIL ?? "leadash.official@gmail.com";
const APP_URL_BASE = process.env.APP_URL ?? "https://leadash.com";

async function sendProvisioningAlert(opts: {
  domain:        string;
  inboxCount:    number;
  inboxEmails:   string[];
  workspaceId:   string;
  workspaceEmail: string;
}): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  const from      = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.com";
  const subject   = `[Leadash] New Microsoft Inbox Order — ${opts.domain}`;

  const emailList = opts.inboxEmails.map(e => `<li>${e}</li>`).join("");
  const html = `
<div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#374151">
  <div style="background:#1c1917;padding:20px 28px;border-radius:12px 12px 0 0">
    <span style="font-size:18px;font-weight:800;color:#fff">Leadash</span>
    <p style="color:#9ca3af;font-size:12px;margin:4px 0 0">New Microsoft 365 Inbox Order</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
    <p style="font-size:15px;margin:0 0 16px">A new Microsoft 365 domain provisioning request has been submitted and is awaiting vendor fulfillment.</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:20px">
      <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb;width:40%">Domain</td><td style="padding:8px 12px;font-weight:600;border:1px solid #e5e7eb">${opts.domain}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb">Inbox Count</td><td style="padding:8px 12px;font-weight:600;border:1px solid #e5e7eb">${opts.inboxCount}</td></tr>
      <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb">Workspace ID</td><td style="padding:8px 12px;font-weight:600;border:1px solid #e5e7eb">${opts.workspaceId}</td></tr>
      <tr><td style="padding:8px 12px;color:#6b7280;border:1px solid #e5e7eb">Workspace Email</td><td style="padding:8px 12px;font-weight:600;border:1px solid #e5e7eb">${opts.workspaceEmail}</td></tr>
    </table>
    <p style="font-weight:700;font-size:13px;margin:0 0 8px;color:#111">Inboxes to Provision</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.8">${emailList}</ul>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <a href="${APP_URL_BASE}/vendor" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">Open Vendor Portal</a>
      <a href="${APP_URL_BASE}/admin/domains?filter=ms_pending" style="display:inline-block;background:#f3f4f6;color:#111;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">Admin Domains</a>
    </div>
  </div>
</div>`;

  const text = [
    `New Microsoft 365 Inbox Order — ${opts.domain}`,
    ``,
    `Domain: ${opts.domain}`,
    `Inbox Count: ${opts.inboxCount}`,
    `Workspace: ${opts.workspaceId} (${opts.workspaceEmail})`,
    ``,
    `Inboxes to provision:`,
    ...opts.inboxEmails.map(e => `  - ${e}`),
    ``,
    `Vendor Portal: ${APP_URL_BASE}/vendor`,
    `Admin Domains: ${APP_URL_BASE}/admin/domains?filter=ms_pending`,
  ].join("\n");

  try {
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ from: `Leadash <${from}>`, to: [OWNER_EMAIL], subject, html, text }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    } else {
      const postalHost = process.env.POSTAL_HOST ?? process.env.SMTP_HOST;
      const postalKey  = process.env.POSTAL_API_KEY;
      if (!postalHost || !postalKey) throw new Error("No email transport configured");
      const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
        method:  "POST",
        headers: { "X-Server-API-Key": postalKey, "Content-Type": "application/json" },
        body:    JSON.stringify({ from: `Leadash <${from}>`, to: [OWNER_EMAIL], subject, html_body: html, plain_body: text }),
      });
      if (!res.ok) throw new Error(`Postal API ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error("[provision:ms] provisioning alert email failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

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
  if (domainRecord.status === "active") return;

  if (domainRecord.inbox_provider === "microsoft365") {
    return processProvisionMicrosoft(domainRecord, db, workspace_id);
  }

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

  // ── Step 1: Purchase domain via Namecheap (VPS IP is whitelisted) ─────────
  const { data: wsSettings } = await db
    .from("workspace_settings")
    .select("registrant_first_name, registrant_last_name, registrant_email, registrant_phone, registrant_address, registrant_city, registrant_state, registrant_zip, registrant_country")
    .eq("workspace_id", workspace_id)
    .single();

  if (!wsSettings?.registrant_first_name || !wsSettings?.registrant_email) {
    throw new Error("Registrant contact info is incomplete. Please fill in Settings → Outreach → Domain Registrant Info.");
  }

  await purchaseDomain(domainRecord.domain, {
    first_name: wsSettings.registrant_first_name,
    last_name:  wsSettings.registrant_last_name  ?? "",
    email:      wsSettings.registrant_email,
    phone:      wsSettings.registrant_phone      ?? "",
    address:    wsSettings.registrant_address    ?? "",
    city:       wsSettings.registrant_city       ?? "",
    state:      wsSettings.registrant_state      ?? "",
    zip:        wsSettings.registrant_zip        ?? "",
    country:    wsSettings.registrant_country    ?? "US",
  });

  // ── Step 2: Register domain with Postal + get DKIM public key ─────────────
  await setStatus("dns_pending");
  const postalDomain = await registerDomain(domainRecord.domain)
    .catch(e => { throw new Error(`Postal registerDomain: ${e.message}`); });

  // ── Step 3: Add zone to Cloudflare + point Namecheap nameservers ──────────
  await sleep(5_000);
  const { nameservers } = await addZone(domainRecord.domain)
    .catch(e => { throw new Error(`CF addZone: ${e.message}`); });
  await updateNameservers(domainRecord.domain, nameservers)
    .catch(e => { throw new Error(`Namecheap updateNameservers: ${e.message}`); });

  // ── Step 4: Publish DNS records via Cloudflare ────────────────────────────
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

  // ── Step 4b: Optional web redirect + email forwarding ────────────────────
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

  // ── Step 5: Wait for DKIM DNS propagation ────────────────────────────────
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

  // ── Step 6: Pick Postal node + create SMTP credentials + inboxes ─────────
  const smtpSettings = getSmtpSettings();
  const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: sharedNodes } = await db
    .from("postal_nodes")
    .select("id, inbox_limit")
    .eq("status", "active")
    .eq("is_shared", true);

  let assignedNodeId: string | null = null;
  if (sharedNodes?.length) {
    const counts = await Promise.all(
      sharedNodes.map(async (n: { id: string; inbox_limit: number }) => {
        const { count } = await db
          .from("outreach_inboxes")
          .select("id", { count: "exact", head: true })
          .eq("postal_node_id", n.id)
          .eq("status", "active");
        return { id: n.id, used: count ?? 0, limit: n.inbox_limit };
      }),
    );
    const available = counts.filter(n => n.used < n.limit).sort((a, b) => (a.used / a.limit) - (b.used / b.limit));
    if (!available.length) {
      throw new Error("All shared Postal nodes are at capacity. Add a new node before provisioning more inboxes.");
    }
    assignedNodeId = available[0].id;
  }

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
      daily_send_limit:     1,
      warmup_enabled:       true,
      warmup_current_daily: 1,
      warmup_target_daily:  30,
      warmup_ends_at:       warmupEndsAt,
      first_name:           domainRecord.first_name ?? null,
      last_name:            domainRecord.last_name  ?? null,
      postal_node_id:       assignedNodeId,
    });
    if (inboxError) throw new Error(`Failed to create inbox ${email}: ${inboxError.message}`);
  }

  // ── Step 7: Register inbound route in Postal ─────────────────────────────
  const appUrl = process.env.APP_URL ?? "https://leadash.com";
  await createInboundRoute(domainRecord.domain, `${appUrl}/api/outreach/inbound`).catch(err => {
    console.warn(`[provision] createInboundRoute failed (non-fatal):`, err instanceof Error ? err.message : err);
  });

  // ── Step 8: Mark domain active ───────────────────────────────────────────
  await db
    .from("outreach_domains")
    .update({
      status:          "active",
      warmup_ends_at:  warmupEndsAt,
      postal_node_id:  assignedNodeId,
      updated_at:      new Date().toISOString(),
    })
    .eq("id", domain_record_id);

  console.log(`[provision] Done: ${domainRecord.domain}`);
}

// ── Microsoft 365 provisioning (hybrid DNS: inbound via Postal, outbound via M365) ──

async function processProvisionMicrosoft(
  domainRecord: Record<string, unknown>,
  db: SupabaseClient,
  workspace_id: string,
) {
  const domain          = domainRecord.domain          as string;
  const domain_record_id = domainRecord.id             as string;
  const mailboxPrefixes = Array.isArray(domainRecord.mailbox_prefixes)
    ? (domainRecord.mailbox_prefixes as string[])
    : null;
  const mailboxCount  = (domainRecord.mailbox_count  as number)  ?? 1;
  const mailboxPrefix = (domainRecord.mailbox_prefix as string)  ?? "contact";

  async function setStatus(status: string, errorMessage?: string) {
    await db
      .from("outreach_domains")
      .update({ status, error_message: errorMessage ?? null, updated_at: new Date().toISOString() })
      .eq("id", domain_record_id);
  }

  // ── Step 1: Purchase domain via Namecheap ────────────────────────────────
  const { data: wsSettings } = await db
    .from("workspace_settings")
    .select("registrant_first_name, registrant_last_name, registrant_email, registrant_phone, registrant_address, registrant_city, registrant_state, registrant_zip, registrant_country")
    .eq("workspace_id", workspace_id)
    .single();

  if (!wsSettings?.registrant_first_name || !wsSettings?.registrant_email) {
    throw new Error("Registrant contact info is incomplete. Please fill in Settings → Outreach → Domain Registrant Info.");
  }

  await purchaseDomain(domain, {
    first_name: wsSettings.registrant_first_name,
    last_name:  wsSettings.registrant_last_name  ?? "",
    email:      wsSettings.registrant_email,
    phone:      wsSettings.registrant_phone      ?? "",
    address:    wsSettings.registrant_address    ?? "",
    city:       wsSettings.registrant_city       ?? "",
    state:      wsSettings.registrant_state      ?? "",
    zip:        wsSettings.registrant_zip        ?? "",
    country:    wsSettings.registrant_country    ?? "US",
  });

  // ── Step 2: Add Cloudflare zone + point nameservers ─────────────────────
  await setStatus("dns_pending");
  await sleep(5_000);
  const { nameservers } = await addZone(domain)
    .catch(e => { throw new Error(`CF addZone: ${e.message}`); });
  await updateNameservers(domain, nameservers)
    .catch(e => { throw new Error(`Namecheap updateNameservers: ${e.message}`); });

  // ── Step 3: Publish Microsoft hybrid DNS records ─────────────────────────
  const postalIp  = process.env.POSTAL_SERVER_IP ?? "";
  const postalMxHost = process.env.POSTAL_MX_HOST ?? process.env.POSTAL_SMTP_HOST ?? postalIp;
  if (!postalIp) throw new Error("POSTAL_SERVER_IP env var is not set");

  const dnsRecords = buildMicrosoftHybridDnsRecords(domain, postalMxHost, postalIp);
  await publishDnsRecords(domain, dnsRecords)
    .catch(e => { throw new Error(`CF publishDnsRecords: ${e.message}`); });
  await db.from("outreach_domains").update({ dns_records: dnsRecords }).eq("id", domain_record_id);

  // ── Step 4: Register inbound route in Postal (replies still via Postal) ──
  const appUrl = process.env.APP_URL ?? "https://leadash.com";
  await createInboundRoute(domain, `${appUrl}/api/outreach/inbound`).catch(err => {
    console.warn(`[provision:ms] createInboundRoute failed (non-fatal):`, err instanceof Error ? err.message : err);
  });

  // ── Step 5: Create placeholder inboxes (status=provisioning, no SMTP creds) ─
  const warmupEndsAt = new Date(Date.now() + MS_WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const logins = mailboxPrefixes
    ?? Array.from({ length: mailboxCount }, (_, i) => `${mailboxPrefix}${i + 1}`);

  const inboxEmails: string[] = [];
  for (const login of logins) {
    const email = `${login}@${domain}`;
    inboxEmails.push(email);
    const { error: inboxError } = await db.from("outreach_inboxes").insert({
      workspace_id,
      domain_id:            domain_record_id,
      label:                email,
      email_address:        email,
      provider:             "microsoft365",
      status:               "provisioning",
      smtp_host:            "smtp.office365.com",
      smtp_port:            587,
      smtp_user:            null,
      smtp_pass_encrypted:  null,
      daily_send_limit:     50,
      warmup_enabled:       false,
      warmup_current_daily: 1,
      warmup_target_daily:  50,
      warmup_ends_at:       warmupEndsAt,
      first_name:           (domainRecord.first_name as string | null) ?? null,
      last_name:            (domainRecord.last_name  as string | null) ?? null,
      postal_node_id:       null,
    });
    if (inboxError) throw new Error(`Failed to create placeholder inbox ${email}: ${inboxError.message}`);
  }

  // ── Step 6: Mark domain as provisioning (awaiting vendor) ────────────────
  await db
    .from("outreach_domains")
    .update({
      status:         "provisioning",
      warmup_ends_at: warmupEndsAt,
      updated_at:     new Date().toISOString(),
    })
    .eq("id", domain_record_id);

  // ── Step 7: Notify owner with inbox list ─────────────────────────────────
  const { data: wsUser } = await db
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspace_id)
    .single();
  const { data: ownerProfile } = wsUser?.owner_id
    ? await db.from("profiles").select("email").eq("id", wsUser.owner_id).single()
    : { data: null };

  await sendProvisioningAlert({
    domain,
    inboxCount:     inboxEmails.length,
    inboxEmails,
    workspaceId:    workspace_id,
    workspaceEmail: ownerProfile?.email ?? "unknown",
  });

  console.log(`[provision:ms] Done — ${domain} (${inboxEmails.length} inboxes awaiting vendor)`);
}
