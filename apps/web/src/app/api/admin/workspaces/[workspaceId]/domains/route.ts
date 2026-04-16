import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { registerDomain, isDomainVerified, createSmtpCredential, getSmtpSettings } from "@/lib/outreach/postal";
import { publishDnsRecords, buildPostalMailDnsRecords } from "@/lib/outreach/cloudflare";
import { encrypt } from "@/lib/outreach/crypto";

const WARMUP_DAYS = 21;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

// GET /api/admin/workspaces/[workspaceId]/domains
// Lists all outreach domains + their inboxes for a workspace.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await params;

  const { data: domains, error } = await ctx.db
    .from("outreach_domains")
    .select("id, domain, status, mailbox_count, warmup_ends_at, error_message, created_at, dns_records, mailbox_prefixes, first_name, last_name")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach inbox counts
  const domainIds = (domains ?? []).map((d: { id: string }) => d.id);
  const { data: inboxes } = domainIds.length
    ? await ctx.db.from("outreach_inboxes").select("id, domain_id, email_address, status").in("domain_id", domainIds)
    : { data: [] };

  const inboxMap = new Map<string, typeof inboxes>();
  for (const inbox of (inboxes ?? [])) {
    const arr = inboxMap.get(inbox.domain_id) ?? [];
    arr.push(inbox);
    inboxMap.set(inbox.domain_id, arr);
  }

  return NextResponse.json({
    domains: (domains ?? []).map((d: { id: string }) => ({
      ...d,
      inboxes: inboxMap.get(d.id) ?? [],
    })),
  });
}

// POST /api/admin/workspaces/[workspaceId]/domains
// Adds/connects a new domain on behalf of a workspace (admin only).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await params;

  const { domain, mailbox_prefixes, first_name, last_name, use_cloudflare = false } =
    await req.json() as {
      domain: string;
      mailbox_prefixes: string[];
      first_name?: string;
      last_name?: string;
      use_cloudflare?: boolean;
    };

  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  if (!mailbox_prefixes?.length || mailbox_prefixes.length > 5)
    return NextResponse.json({ error: "mailbox_prefixes must have 1–5 entries" }, { status: 400 });

  // Check workspace exists
  const { data: ws } = await ctx.db.from("workspaces").select("id").eq("id", workspaceId).single();
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // Check for duplicate domain
  const { data: existing } = await ctx.db
    .from("outreach_domains")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("domain", domain.toLowerCase().trim())
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Domain already added for this workspace" }, { status: 409 });

  // Insert domain record
  const { data: rec, error: insertError } = await ctx.db
    .from("outreach_domains")
    .insert({
      workspace_id:    workspaceId,
      domain:          domain.toLowerCase().trim(),
      status:          "dns_pending",
      mailbox_count:   mailbox_prefixes.length,
      mailbox_prefix:  mailbox_prefixes[0],
      mailbox_prefixes,
      first_name:      first_name ?? null,
      last_name:       last_name  ?? null,
      daily_send_limit: 30,
      payment_provider: "none",
    })
    .select("id")
    .single();

  if (insertError || !rec)
    return NextResponse.json({ error: insertError?.message ?? "Failed to create record" }, { status: 500 });

  const domainRecordId = rec.id;

  const postalIp = process.env.POSTAL_SERVER_IP ?? "";
  if (!postalIp) {
    await ctx.db.from("outreach_domains").update({ status: "failed", error_message: "POSTAL_SERVER_IP is not configured" }).eq("id", domainRecordId);
    return NextResponse.json({ error: "POSTAL_SERVER_IP is not configured" }, { status: 500 });
  }

  let dkimPublicKey: string;
  try {
    const postalDomain = await registerDomain(domain);
    dkimPublicKey = postalDomain.dkim_public_key;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.db.from("outreach_domains").update({ status: "failed", error_message: msg }).eq("id", domainRecordId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const dnsRecords = buildPostalMailDnsRecords(domain, postalIp, dkimPublicKey);

  if (use_cloudflare) {
    try { await publishDnsRecords(domain, dnsRecords); } catch { /* non-fatal */ }
  }

  await ctx.db.from("outreach_domains").update({ dns_records: dnsRecords }).eq("id", domainRecordId);

  return NextResponse.json({ domain_record_id: domainRecordId, dns_records: dnsRecords });
}

// PATCH /api/admin/workspaces/[workspaceId]/domains
// Verifies DNS + creates inboxes for a domain in dns_pending or verifying state.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await params;

  const { domain_record_id } = await req.json() as { domain_record_id: string };
  if (!domain_record_id) return NextResponse.json({ error: "domain_record_id required" }, { status: 400 });

  const { data: domainRecord } = await ctx.db
    .from("outreach_domains")
    .select("*")
    .eq("id", domain_record_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (domainRecord.status === "active") {
    const { count } = await ctx.db
      .from("outreach_inboxes")
      .select("id", { count: "exact", head: true })
      .eq("domain_id", domain_record_id)
      .eq("workspace_id", workspaceId);
    if ((count ?? 0) > 0) return NextResponse.json({ ok: true, status: "active", inbox_count: count ?? 0 });
  }

  await ctx.db.from("outreach_domains").update({ status: "verifying" }).eq("id", domain_record_id);

  let verified = false;
  for (let i = 0; i < 3; i++) {
    verified = await isDomainVerified(domainRecord.domain);
    if (verified) break;
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!verified) {
    return NextResponse.json({
      ok: false,
      status: "verifying",
      message: "DNS records not yet detected. This can take up to 30 minutes.",
    });
  }

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
    await ctx.db.from("outreach_inboxes").insert({
      workspace_id:        workspaceId,
      domain_id:           domain_record_id,
      label:               email,
      email_address:       email,
      provider:            "smtp",
      status:              "active",
      smtp_host:           smtpSettings.host,
      smtp_port:           smtpSettings.port,
      smtp_user:           cred.username,
      smtp_pass_encrypted: encrypt(cred.password),
      imap_host:           null,
      imap_port:           null,
      daily_send_limit:    30,
      warmup_enabled:      true,
      warmup_target_daily: 30,
      warmup_ramp_per_week: 3,
      warmup_ends_at:      warmupEndsAt,
      first_name:          domainRecord.first_name ?? null,
      last_name:           domainRecord.last_name  ?? null,
    });
  }

  await ctx.db.from("outreach_domains")
    .update({ status: "active", warmup_ends_at: warmupEndsAt, updated_at: new Date().toISOString() })
    .eq("id", domain_record_id);

  return NextResponse.json({ ok: true, status: "active", inbox_count: logins.length });
}

// DELETE /api/admin/workspaces/[workspaceId]/domains
// Removes a domain (and its inboxes) from a workspace.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await params;

  const { domain_id } = await req.json() as { domain_id: string };
  if (!domain_id) return NextResponse.json({ error: "domain_id required" }, { status: 400 });

  const { data: domain } = await ctx.db
    .from("outreach_domains")
    .select("id")
    .eq("id", domain_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domain) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete inboxes first
  await ctx.db.from("outreach_inboxes").delete().eq("domain_id", domain_id).eq("workspace_id", workspaceId);
  await ctx.db.from("outreach_domains").delete().eq("id", domain_id);

  return NextResponse.json({ ok: true });
}
