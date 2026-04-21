import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { registerDomain, isDomainVerified, createSmtpCredential, getSmtpSettings, createInboundRoute } from "@/lib/outreach/postal";
import { addZone, publishDnsRecords, buildPostalMailDnsRecords, setWebRedirect, setEmailForwarding } from "@/lib/outreach/cloudflare";
import { purchaseDomain, updateNameservers } from "@/lib/outreach/porkbun";
import { verifyPaystackPayment } from "@/lib/billing/paystack";
import { encrypt } from "@/lib/outreach/crypto";
import Stripe from "stripe";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!); }

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
    .select("id, domain, status, mailbox_count, warmup_ends_at, error_message, created_at, dns_records, mailbox_prefixes, first_name, last_name, redirect_url, reply_forward_to, forward_verified")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type DomainRow = NonNullable<typeof domains>[number];
  type InboxRow  = {
    id: string; domain_id: string; email_address: string; status: string;
    label: string | null; first_name: string | null; last_name: string | null;
    daily_send_limit: number | null; warmup_enabled: boolean | null;
    warmup_target_daily: number | null; warmup_ramp_per_week: number | null;
    warmup_ends_at: string | null; send_window_start: string | null;
    send_window_end: string | null; timezone: string | null;
    smtp_host: string | null; smtp_port: number | null; smtp_user: string | null;
  };

  const rows = (domains ?? []) as DomainRow[];

  // Attach inboxes
  const domainIds = rows.map(d => d.id);
  const { data: inboxData } = domainIds.length
    ? await ctx.db.from("outreach_inboxes").select("id, domain_id, email_address, status").in("domain_id", domainIds)
    : { data: [] as InboxRow[] };

  const inboxMap = new Map<string, InboxRow[]>();
  for (const inbox of (inboxData ?? []) as InboxRow[]) {
    const arr = inboxMap.get(inbox.domain_id) ?? [];
    arr.push(inbox);
    inboxMap.set(inbox.domain_id, arr);
  }

  return NextResponse.json({
    domains: rows.map(d => ({ ...d, inboxes: inboxMap.get(d.id) ?? [] })),
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

  const body = await req.json() as { domain_record_id: string; action?: string };
  const { domain_record_id, action } = body;
  if (!domain_record_id) return NextResponse.json({ error: "domain_record_id required" }, { status: 400 });

  const { data: domainRecord } = await ctx.db
    .from("outreach_domains")
    .select("*")
    .eq("id", domain_record_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Retry full provision (for failed paid domains) ────────────────────────
  if (action === "retry_provision") {
    const WARMUP_DAYS = 21;
    async function setStatus(status: string, errorMessage?: string) {
      await ctx!.db.from("outreach_domains").update({
        status,
        ...(errorMessage ? { error_message: errorMessage } : { error_message: null }),
        updated_at: new Date().toISOString(),
      }).eq("id", domain_record_id);
    }

    try {
      await setStatus("purchasing");

      // Step 1: Verify payment (skip if admin-provisioned with no payment)
      const provider = domainRecord.payment_provider ?? "stripe";
      if (provider !== "none") {
        if (provider === "stripe") {
          const sessionId = domainRecord.stripe_session_id;
          if (sessionId) {
            const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
            const isPaid = session.payment_status === "paid" ||
              (session.mode === "subscription" && (session.status === "complete" ||
                (typeof session.subscription === "object" && session.subscription !== null &&
                  ["active", "trialing"].includes((session.subscription as { status: string }).status))));
            if (!isPaid) { await setStatus("failed", "Payment not completed — cannot retry"); return NextResponse.json({ error: "Payment not verified" }, { status: 402 }); }
          }
        } else {
          const ref = domainRecord.paystack_reference;
          if (ref && ref !== "free") {
            const { paid } = await verifyPaystackPayment(ref);
            if (!paid) { await setStatus("failed", "Payment not completed — cannot retry"); return NextResponse.json({ error: "Payment not verified" }, { status: 402 }); }
          }
        }
      }

      // Step 2: Purchase domain (idempotent)
      await purchaseDomain(domainRecord.domain, undefined, domainRecord.domain_price_usd ?? undefined);

      // Step 3: Register with Postal
      await setStatus("dns_pending");
      const postalIp = process.env.POSTAL_SERVER_IP ?? "";
      if (!postalIp) throw new Error("POSTAL_SERVER_IP not configured");
      const postalDomain = await registerDomain(domainRecord.domain);

      // Step 4: Add CF zone + update nameservers
      const { nameservers } = await addZone(domainRecord.domain);
      await updateNameservers(domainRecord.domain, nameservers);

      // Step 5: Publish DNS
      const dnsRecords = buildPostalMailDnsRecords(domainRecord.domain, postalIp, postalDomain.dkim_public_key);
      await publishDnsRecords(domainRecord.domain, dnsRecords);
      await ctx.db.from("outreach_domains").update({ dns_records: dnsRecords }).eq("id", domain_record_id);

      // Step 5b: Optional redirect/forwarding
      if (domainRecord.redirect_url) {
        await setWebRedirect(domainRecord.domain, domainRecord.redirect_url).catch(() => {});
      }
      if (domainRecord.reply_forward_to) {
        await setEmailForwarding(domainRecord.domain, domainRecord.reply_forward_to).catch(() => {});
      }

      // Step 6: Verify DKIM
      await setStatus("verifying");
      let verified = false;
      for (let i = 0; i < 3; i++) {
        verified = await isDomainVerified(domainRecord.domain);
        if (verified) break;
        await new Promise(r => setTimeout(r, 5000));
      }

      // Step 7: Create inboxes
      const smtpSettings = getSmtpSettings();
      const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const logins: string[] = Array.isArray(domainRecord.mailbox_prefixes) && domainRecord.mailbox_prefixes.length > 0
        ? domainRecord.mailbox_prefixes as string[]
        : Array.from({ length: domainRecord.mailbox_count ?? 1 }, (_, i) => `${domainRecord.mailbox_prefix}${i + 1}`);

      // Skip already-created inboxes (idempotent)
      const { data: existingInboxes } = await ctx.db.from("outreach_inboxes").select("email_address").eq("domain_id", domain_record_id);
      const existing = new Set((existingInboxes ?? []).map((i: { email_address: string }) => i.email_address));

      for (const login of logins) {
        const email = `${login}@${domainRecord.domain}`;
        if (existing.has(email)) continue;
        const cred = await createSmtpCredential(domainRecord.domain, email);
        await ctx.db.from("outreach_inboxes").insert({
          workspace_id: workspaceId, domain_id: domain_record_id,
          label: email, email_address: email,
          provider: "smtp", status: "active",
          smtp_host: smtpSettings.host, smtp_port: smtpSettings.port,
          smtp_user: cred.username, smtp_pass_encrypted: encrypt(cred.password),
          daily_send_limit: 30, warmup_enabled: true,
          warmup_target_daily: 30, warmup_ramp_per_week: 3,
          warmup_ends_at: warmupEndsAt,
          first_name: domainRecord.first_name ?? null, last_name: domainRecord.last_name ?? null,
        });
      }

      // Step 8: Inbound route
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      await createInboundRoute(domainRecord.domain, `${appUrl}/api/outreach/inbound`).catch(() => {});

      await ctx.db.from("outreach_domains").update({
        status: "active", warmup_ends_at: warmupEndsAt, updated_at: new Date().toISOString(),
      }).eq("id", domain_record_id);

      return NextResponse.json({ ok: true, status: "active" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await setStatus("failed", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ── Admin: add inboxes to active domain (no payment required) ───────────────
  if (action === "add_inboxes") {
    const { new_prefixes } = body as { domain_record_id: string; action: string; new_prefixes: string[] };
    if (!new_prefixes?.length) return NextResponse.json({ error: "new_prefixes required" }, { status: 400 });

    const smtpSettings = getSmtpSettings();
    const warmupEndsAt = new Date(Date.now() + WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await ctx.db.from("outreach_inboxes").select("email_address").eq("domain_id", domain_record_id);
    const existingEmails = new Set((existing ?? []).map((i: { email_address: string }) => i.email_address));
    const created: string[] = [];

    for (const prefix of new_prefixes) {
      const email = `${prefix}@${domainRecord.domain}`;
      if (existingEmails.has(email)) continue;
      const cred = await createSmtpCredential(domainRecord.domain, email).catch(e => { throw new Error(`createSmtpCredential(${email}): ${e.message}`); });
      await ctx.db.from("outreach_inboxes").insert({
        workspace_id: workspaceId, domain_id: domain_record_id,
        label: email, email_address: email,
        provider: "smtp", status: "active",
        smtp_host: smtpSettings.host, smtp_port: smtpSettings.port,
        smtp_user: cred.username, smtp_pass_encrypted: encrypt(cred.password),
        daily_send_limit: 30, warmup_enabled: true,
        warmup_target_daily: 30, warmup_ramp_per_week: 3,
        warmup_ends_at: warmupEndsAt,
        first_name: domainRecord.first_name ?? null, last_name: domainRecord.last_name ?? null,
      });
      created.push(email);
    }

    const allPrefixes = [...(Array.isArray(domainRecord.mailbox_prefixes) ? domainRecord.mailbox_prefixes as string[] : []), ...new_prefixes];
    await ctx.db.from("outreach_domains").update({ mailbox_count: allPrefixes.length, mailbox_prefixes: allPrefixes }).eq("id", domain_record_id);
    return NextResponse.json({ ok: true, count: created.length, created });
  }

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
      provider:            "postal",
      status:              "active",
      smtp_host:           smtpSettings.host,
      smtp_port:           smtpSettings.port,
      smtp_user:           cred.username,
      smtp_pass_encrypted: encrypt(cred.password),
      imap_host:           smtpSettings.imap_host,
      imap_port:           smtpSettings.imap_port,
      daily_send_limit:    30,
      warmup_enabled:      true,
      warmup_target_daily: 30,
      warmup_ramp_per_week: 3,
      warmup_ends_at:      warmupEndsAt,
      first_name:          domainRecord.first_name ?? null,
      last_name:           domainRecord.last_name  ?? null,
    });
  }

  // Set up Postal inbound HTTP route so replies are forwarded to the webhook
  const appUrl = process.env.POSTAL_WEBHOOK_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = `${appUrl}/api/outreach/inbound`;
  await createInboundRoute(domainRecord.domain, webhookUrl).catch(() => {
    // Non-fatal
  });

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
