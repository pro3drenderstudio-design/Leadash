import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

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

  // Fetch the inbox IDs that were created for this domain
  const { data: inboxes } = await db
    .from("outreach_inboxes")
    .select("id, email_address, status")
    .eq("domain_id", id)
    .eq("workspace_id", workspaceId);

  return NextResponse.json({
    ...domain,
    inboxes: inboxes ?? [],
  });
}
