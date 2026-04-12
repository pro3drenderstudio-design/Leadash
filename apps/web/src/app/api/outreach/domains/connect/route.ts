import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { registerDomain, isDomainVerified, enableDkimSigning, setMailFromDomain, getSmtpCredentials } from "@/lib/outreach/ses";
import { publishDnsRecords, buildMailDnsRecords } from "@/lib/outreach/cloudflare";
import { encrypt } from "@/lib/outreach/crypto";

const WARMUP_DAYS = 21;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── POST /api/outreach/domains/connect ─────────────────────────────────────────
// Registers an existing domain with SES, publishes DNS records if the domain
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

  // Register with SES + get DKIM tokens
  let dkimTokens: string[];
  try {
    ({ dkimTokens } = await registerDomain(domain));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from("outreach_domains").update({ status: "failed", error_message: msg }).eq("id", domainRecordId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const dnsRecords = buildMailDnsRecords(domain, dkimTokens);

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
// Called after user adds DNS records. Polls SES verification, then creates inboxes.
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
  if (domainRecord.status === "active") return NextResponse.json({ ok: true, status: "active" });

  // Check SES verification
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

  await enableDkimSigning(domainRecord.domain);

  // Create inboxes
  const smtp = getSmtpCredentials();
  const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const logins: string[] = Array.isArray(domainRecord.mailbox_prefixes)
    ? domainRecord.mailbox_prefixes as string[]
    : Array.from({ length: domainRecord.mailbox_count }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

  for (const login of logins) {
    const email = `${login}@${domainRecord.domain}`;
    const { error: inboxError } = await db.from("outreach_inboxes").insert({
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
