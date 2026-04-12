import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { registerDomain, setMailFromDomain, isDomainVerified } from "@/lib/outreach/ses";
import { buildMailDnsRecords, publishDnsRecords } from "@/lib/outreach/cloudflare";

// POST /api/outreach/domains/[id]/ses-register
// Registers an existing domain record with SES and returns the DNS records.
// Used by the "connect existing domain" flow after payment.
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

  // Always re-register to ensure MAIL FROM and latest DNS records are applied
  let dkimTokens: string[];
  try {
    ({ dkimTokens } = await registerDomain(domainRecord.domain));
    await setMailFromDomain(domainRecord.domain).catch(() => {}); // non-fatal
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from("outreach_domains").update({ status: "failed", error_message: msg }).eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const dnsRecords = buildMailDnsRecords(domainRecord.domain, dkimTokens);

  let auto_configured = false;
  if (use_cloudflare) {
    try {
      await publishDnsRecords(domainRecord.domain, dnsRecords);
      auto_configured = true;
    } catch {
      // Non-fatal — user can add manually
    }
  }

  // If domain was already verified in SES, keep it active — we just updated DNS records
  const alreadyVerified = domainRecord.status === "active" || await isDomainVerified(domainRecord.domain).catch(() => false);
  const newStatus = alreadyVerified ? "active" : "dns_pending";

  await db
    .from("outreach_domains")
    .update({ dns_records: dnsRecords, status: newStatus })
    .eq("id", id);

  return NextResponse.json({ domain: domainRecord.domain, dns_records: dnsRecords, auto_configured, status: newStatus });
}
