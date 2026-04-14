import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { registerDomain, isDomainVerified, createSmtpCredential, getSmtpSettings } from "@/lib/outreach/postal";
import { buildPostalMailDnsRecords, publishDnsRecords } from "@/lib/outreach/cloudflare";
import { encrypt } from "@/lib/outreach/crypto";

// POST /api/outreach/domains/[id]/ses-register
// Reconfigures an existing domain to use Postal for outbound sending.
// Re-registers with Postal, refreshes DNS records, and re-provisions
// SMTP credentials for all inboxes on the domain.
// SES inbound (reply detection via S3) is unchanged.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { use_cloudflare = false } = await req.json().catch(() => ({})) as { use_cloudflare?: boolean };

  const { data: domainRecord } = await db
    .from("outreach_domains")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!domainRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const postalIp = process.env.POSTAL_SERVER_IP ?? "";
  if (!postalIp) return NextResponse.json({ error: "POSTAL_SERVER_IP is not configured" }, { status: 500 });

  // Register (or re-register) domain with Postal — idempotent
  let dkimPublicKey: string;
  try {
    const postalDomain = await registerDomain(domainRecord.domain);
    dkimPublicKey = postalDomain.dkim_public_key;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from("outreach_domains").update({ status: "failed", error_message: msg }).eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const dnsRecords = buildPostalMailDnsRecords(domainRecord.domain, postalIp, dkimPublicKey);

  let auto_configured = false;
  if (use_cloudflare) {
    try {
      await publishDnsRecords(domainRecord.domain, dnsRecords);
      auto_configured = true;
    } catch {
      // Non-fatal — user can add manually
    }
  }

  // Check if DKIM is already propagated
  const alreadyVerified = await isDomainVerified(domainRecord.domain).catch(() => false);
  const newStatus = alreadyVerified ? "active" : "dns_pending";

  await db
    .from("outreach_domains")
    .update({ dns_records: dnsRecords, status: newStatus, error_message: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  // Re-provision Postal SMTP credentials for all existing inboxes on this domain
  const { data: inboxes } = await db
    .from("outreach_inboxes")
    .select("id, email_address")
    .eq("domain_id", id)
    .eq("workspace_id", workspaceId);

  const smtpSettings = getSmtpSettings();
  const credErrors: string[] = [];

  for (const inbox of inboxes ?? []) {
    try {
      const cred = await createSmtpCredential(domainRecord.domain, inbox.email_address);
      await db.from("outreach_inboxes").update({
        smtp_host:           smtpSettings.host,
        smtp_port:           smtpSettings.port,
        smtp_user:           cred.username,
        smtp_pass_encrypted: encrypt(cred.password),
        imap_host:           null,
        imap_port:           null,
        status:              "active",
        last_error:          null,
        updated_at:          new Date().toISOString(),
      }).eq("id", inbox.id);
    } catch (err) {
      credErrors.push(`${inbox.email_address}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    domain:          domainRecord.domain,
    dns_records:     dnsRecords,
    auto_configured,
    status:          newStatus,
    inboxes_updated: (inboxes?.length ?? 0) - credErrors.length,
    ...(credErrors.length ? { credential_errors: credErrors } : {}),
  });
}
