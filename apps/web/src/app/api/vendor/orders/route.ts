import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const db = createAdminClient();

  const { data: domains } = await db
    .from("outreach_domains")
    .select("id, domain, workspace_id, created_at")
    .eq("inbox_provider", "microsoft365")
    .eq("status", "provisioning")
    .order("created_at", { ascending: false });

  const orders = [];
  for (const d of domains ?? []) {
    const { data: inboxes } = await db
      .from("outreach_inboxes")
      .select("id, email_address, status")
      .eq("domain_id", d.id)
      .eq("status", "provisioning");
    orders.push({ ...d, inboxes: inboxes ?? [] });
  }

  return NextResponse.json(orders);
}
