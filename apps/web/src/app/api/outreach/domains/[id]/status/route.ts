import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { isDomainVerified } from "@/lib/outreach/postal";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { id } = await params;

  const { data: domain, error } = await db
    .from("outreach_domains")
    .select("id, domain, status, mailbox_count, warmup_ends_at, error_message, dns_records, payment_provider, created_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !domain) {
    return NextResponse.json({ error: "Domain record not found" }, { status: 404 });
  }

  // If domain is still dns_pending, do a live DKIM check to self-heal without needing a cron.
  let resolvedStatus = domain.status as string;
  if (resolvedStatus === "dns_pending") {
    try {
      const verified = await isDomainVerified(domain.domain as string);
      if (verified) {
        resolvedStatus = "active";
        await db
          .from("outreach_domains")
          .update({ status: "active", error_message: null, updated_at: new Date().toISOString() })
          .eq("id", id);
        // Activate any inboxes still sitting at dns_pending for this domain
        await db
          .from("outreach_inboxes")
          .update({ status: "active", last_error: null, updated_at: new Date().toISOString() })
          .eq("domain_id", id)
          .eq("status", "dns_pending");
      }
    } catch {
      // Non-fatal — return current DB status if DNS check fails
    }
  }

  // Fetch the inbox IDs that were created for this domain
  const { data: inboxes } = await db
    .from("outreach_inboxes")
    .select("id, email_address, status")
    .eq("domain_id", id)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({
    ...domain,
    status:  resolvedStatus,
    inboxes: inboxes ?? [],
  });
}
