import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createAdminClient } from "@/lib/supabase/server";
import { addDnsRecords, buildMicrosoftTenantDnsRecords } from "@/lib/outreach/cloudflare";
import { encrypt } from "@/lib/outreach/crypto";

const MS_WARMUP_DAYS = 14;
const OWNER_EMAIL    = process.env.OWNER_ALERT_EMAIL ?? "leadash.official@gmail.com";

interface InboxCred {
  id:       string;
  email:    string;
  password: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id }   = await params;
  const db       = createAdminClient();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { verificationTxt, dkimSel1Target, dkimSel2Target, creds } = body as {
    verificationTxt: string;
    dkimSel1Target:  string;
    dkimSel2Target:  string;
    creds:           InboxCred[];
  };

  if (!verificationTxt || !dkimSel1Target || !dkimSel2Target || !Array.isArray(creds) || creds.length === 0) {
    return NextResponse.json({ error: "verificationTxt, dkimSel1Target, dkimSel2Target, and creds are required" }, { status: 400 });
  }

  // Validate domain
  const { data: domain } = await db
    .from("outreach_domains")
    .select("id, domain, workspace_id, inbox_provider, status")
    .eq("id", id)
    .single();

  if (!domain || domain.inbox_provider !== "microsoft365") {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }
  if (domain.status !== "provisioning") {
    return NextResponse.json({ error: `Domain status is '${domain.status}', expected 'provisioning'` }, { status: 409 });
  }

  // Validate that cred IDs match actual provisioning inboxes
  const { data: dbInboxes } = await db
    .from("outreach_inboxes")
    .select("id, email_address")
    .eq("domain_id", id)
    .eq("status", "provisioning");

  const dbInboxMap = new Map((dbInboxes ?? []).map((i: { id: string; email_address: string }) => [i.id, i.email_address]));
  for (const cred of creds) {
    if (!dbInboxMap.has(cred.id)) {
      return NextResponse.json({ error: `Inbox ${cred.id} not found in this domain` }, { status: 400 });
    }
    if (!cred.password?.trim()) {
      return NextResponse.json({ error: `Password required for inbox ${cred.email}` }, { status: 400 });
    }
  }

  // ── Step 1: Push M365 tenant DNS records to Cloudflare ───────────────────
  try {
    const tenantRecords = buildMicrosoftTenantDnsRecords({ verificationTxt, dkimSel1Target, dkimSel2Target });
    await addDnsRecords(domain.domain, tenantRecords);
  } catch (err) {
    return NextResponse.json({ error: `DNS update failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  // ── Step 2: SMTP connectivity test + activate each inbox ─────────────────
  const warmupEndsAt = new Date(Date.now() + MS_WARMUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const details: string[] = [];
  let passed = 0;
  let failed = 0;

  for (const cred of creds) {
    const transport = nodemailer.createTransport({
      host:   "smtp.office365.com",
      port:   587,
      secure: false,
      auth:   { user: cred.email, pass: cred.password },
      tls:    { ciphers: "SSLv3" },
    });

    let testOk  = false;
    let testErr = "";
    try {
      await transport.verify();
      testOk = true;
    } catch (e) {
      testErr = e instanceof Error ? e.message : String(e);
    }

    if (testOk) {
      await db.from("outreach_inboxes").update({
        smtp_pass_encrypted:  encrypt(cred.password),
        smtp_user:            cred.email,
        status:               "active",
        warmup_enabled:       true,
        warmup_ends_at:       warmupEndsAt,
        updated_at:           new Date().toISOString(),
      }).eq("id", cred.id);
      details.push(`✓ ${cred.email} — SMTP verified`);
      passed++;
    } else {
      await db.from("outreach_inboxes").update({
        smtp_pass_encrypted:  encrypt(cred.password),
        smtp_user:            cred.email,
        status:               "error",
        last_error:           `SMTP test failed: ${testErr}`,
        updated_at:           new Date().toISOString(),
      }).eq("id", cred.id);
      details.push(`✗ ${cred.email} — ${testErr}`);
      failed++;
    }
  }

  // ── Step 3: Activate domain if at least one inbox passed ─────────────────
  if (passed > 0) {
    await db.from("outreach_domains").update({
      status:         "active",
      ms_tenant_data: { verificationTxt, dkimSel1Target, dkimSel2Target },
      warmup_ends_at: warmupEndsAt,
      updated_at:     new Date().toISOString(),
    }).eq("id", id);
  }

  // ── Step 4: Notify admin ──────────────────────────────────────────────────
  const statusLabel = failed === 0 ? "All inboxes activated" : `${passed} activated, ${failed} failed`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://leadash.com";
  try {
    await notifyAdmin({
      domain: domain.domain,
      statusLabel,
      details,
      appUrl,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ passed, failed, details });
}

async function notifyAdmin(opts: { domain: string; statusLabel: string; details: string[]; appUrl: string }) {
  const resendKey = process.env.RESEND_API_KEY;
  const from      = process.env.RESEND_FROM_EMAIL ?? "notifications@leadash.com";
  const subject   = `[Leadash] M365 Provision Done — ${opts.domain}: ${opts.statusLabel}`;

  const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#374151">
  <div style="background:#1c1917;padding:20px 28px;border-radius:12px 12px 0 0">
    <span style="font-size:18px;font-weight:800;color:#fff">Leadash</span>
    <p style="color:#9ca3af;font-size:12px;margin:4px 0 0">Microsoft 365 Provisioning Result</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px">
    <p style="font-weight:700;font-size:15px;margin:0 0 4px">${opts.domain}</p>
    <p style="color:#6b7280;font-size:14px;margin:0 0 16px">${opts.statusLabel}</p>
    <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:2">
      ${opts.details.map(d => `<li>${d}</li>`).join("")}
    </ul>
    <a href="${opts.appUrl}/admin/domains" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">View Admin Domains</a>
  </div>
</div>`;

  const text = [`M365 Provision: ${opts.domain}`, `Status: ${opts.statusLabel}`, ``, ...opts.details].join("\n");

  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: `Leadash <${from}>`, to: [OWNER_EMAIL], subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return;
  }

  const postalHost = process.env.POSTAL_HOST ?? process.env.SMTP_HOST;
  const postalKey  = process.env.POSTAL_API_KEY;
  if (postalHost && postalKey) {
    const res = await fetch(`https://${postalHost}/api/v1/send/message`, {
      method:  "POST",
      headers: { "X-Server-API-Key": postalKey, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: `Leadash <${from}>`, to: [OWNER_EMAIL], subject, html_body: html, plain_body: text }),
    });
    if (!res.ok) throw new Error(`Postal API ${res.status}`);
  }
}
