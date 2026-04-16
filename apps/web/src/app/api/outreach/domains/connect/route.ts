import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { registerDomain, isDomainVerified, createSmtpCredential, getSmtpSettings, createInboundRoute } from "@/lib/outreach/postal";
import { publishDnsRecords, buildPostalMailDnsRecords } from "@/lib/outreach/cloudflare";
import { encrypt } from "@/lib/outreach/crypto";

const WARMUP_DAYS = 21;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── POST /api/outreach/domains/connect ─────────────────────────────────────────
// Registers an existing domain with Postal, publishes DNS records if the domain
// uses Cloudflare, and returns DNS records to display to the user.
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { domain, mailbox_prefixes, first_name, last_name, use_cloudflare = false } =
    await req.json() as {
      domain:            string;
      mailbox_prefixes:  string[];
      first_name?:       string;
      last_name?:        string;
      use_cloudflare?:   boolean;
    };

  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  if (!mailbox_prefixes?.length || mailbox_prefixes.length > 5)
    return NextResponse.json({ error: "mailbox_prefixes must have 1–5 entries" }, { status: 400 });

  // Insert domain record
  const { data: rec, error: insertError } = await db
    .from("outreach_domains")
    .insert({
      workspace_id:     workspaceId,
      domain,
      status:           "dns_pending",
      mailbox_count:    mailbox_prefixes.length,
      mailbox_prefix:   mailbox_prefixes[0],
      mailbox_prefixes,
      first_name:       first_name ?? null,
      last_name:        last_name  ?? null,
      daily_send_limit: 30,
      payment_provider: "none",
    })
    .select("id")
    .single();

  if (insertError || !rec)
    return NextResponse.json({ error: insertError?.message ?? "Failed to create record" }, { status: 500 });

  const domainRecordId = rec.id;

  // Register with Postal + get DKIM public key
  const postalIp = process.env.POSTAL_SERVER_IP ?? "";
  if (!postalIp) {
    await db.from("outreach_domains").update({ status: "failed", error_message: "POSTAL_SERVER_IP is not configured" }).eq("id", domainRecordId);
    return NextResponse.json({ error: "POSTAL_SERVER_IP is not configured" }, { status: 500 });
  }

  let dkimPublicKey: string;
  try {
    const postalDomain = await registerDomain(domain);
    dkimPublicKey = postalDomain.dkim_public_key;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from("outreach_domains").update({ status: "failed", error_message: msg }).eq("id", domainRecordId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const dnsRecords = buildPostalMailDnsRecords(domain, postalIp, dkimPublicKey);

  // If the domain's DNS is managed by Cloudflare in this account, auto-publish
  if (use_cloudflare) {
    try {
      await publishDnsRecords(domain, dnsRecords);
    } catch {
      // Non-fatal — user can add manually
    }
  }

  await db
    .from("outreach_domains")
    .update({ dns_records: dnsRecords })
    .eq("id", domainRecordId);

  return NextResponse.json({ domain_record_id: domainRecordId, dns_records: dnsRecords });
}

// ── PATCH /api/outreach/domains/connect ────────────────────────────────────────
// Called after user adds DNS records. Polls Postal DKIM propagation, then creates inboxes.
export async function PATCH(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { domain_record_id } = await req.json() as { domain_record_id: string };
  if (!domain_record_id)
    return NextResponse.json({ error: "domain_record_id is required" }, { status: 400 });

  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", domain_record_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (domainRecord.status === "active") {
    // Check if inboxes were actually created — re-configure sets status=active but skips inbox creation
    const { count: existingCount } = await db
      .from("outreach_inboxes")
      .select("id", { count: "exact", head: true })
      .eq("domain_id", domain_record_id)
      .eq("workspace_id", workspaceId);
    if ((existingCount ?? 0) > 0) {
      return NextResponse.json({ ok: true, status: "active", inbox_count: existingCount ?? 0 });
    }
    // Fall through to create inboxes (domain is verified but inboxes were never made)
  }

  // Check Postal DKIM DNS propagation
  await db.from("outreach_domains").update({ status: "verifying" }).eq("id", domain_record_id);

  let verified = false;
  for (let i = 0; i < 3; i++) {
    verified = await isDomainVerified(domainRecord.domain);
    if (verified) break;
    await sleep(3000);
  }

  if (!verified) {
    return NextResponse.json({
      ok: false,
      status: "verifying",
      message: "DNS records not yet detected. This can take up to 30 minutes. Check back soon.",
    });
  }

  // Create per-mailbox Postal SMTP credentials + inboxes
  const smtpSettings = getSmtpSettings();
  const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const logins: string[] = Array.isArray(domainRecord.mailbox_prefixes) && domainRecord.mailbox_prefixes.length > 0
    ? domainRecord.mailbox_prefixes as string[]
    : Array.from({ length: domainRecord.mailbox_count }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

  for (const login of logins) {
    const email = `${login}@${domainRecord.domain}`;

    const cred = await createSmtpCredential(domainRecord.domain, email).catch(err => {
      throw new Error(`Postal createSmtpCredential(${email}): ${err.message}`);
    });

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
    if (inboxError) {
      await db.from("outreach_domains").update({ status: "failed", error_message: inboxError.message }).eq("id", domain_record_id);
      return NextResponse.json({ error: `Failed to create inbox ${email}: ${inboxError.message}` }, { status: 500 });
    }
  }

  await db
    .from("outreach_domains")
    .update({ status: "active", warmup_ends_at: warmupEndsAt, updated_at: new Date().toISOString() })
    .eq("id", domain_record_id);

  return NextResponse.json({ ok: true, status: "active", inbox_count: logins.length });
}
