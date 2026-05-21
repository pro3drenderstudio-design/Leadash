import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db     = createAdminClient();

  const { data: domain } = await db
    .from("outreach_domains")
    .select("id, domain, workspace_id, status, inbox_provider")
    .eq("id", id)
    .single();

  if (!domain || domain.inbox_provider !== "microsoft365") {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: inboxes } = await db
    .from("outreach_inboxes")
    .select("id, email_address, status")
    .eq("domain_id", id)
    .order("email_address");

  return NextResponse.json({ ...domain, inboxes: inboxes ?? [] });
}
