import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireVendorAuth } from "@/lib/vendor/auth";

export async function GET(req: NextRequest) {
  if (!requireVendorAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db     = createAdminClient();
  const status = req.nextUrl.searchParams.get("status");

  let query = db
    .from("outreach_domains")
    .select("id, domain, workspace_id, status, created_at, inbox_provider")
    .eq("inbox_provider", "microsoft365")
    .order("created_at", { ascending: false });

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data: domains } = await query;

  const orders = [];
  for (const d of domains ?? []) {
    const { data: inboxes } = await db
      .from("outreach_inboxes")
      .select("id, email_address, status")
      .eq("domain_id", d.id)
      .order("email_address");
    orders.push({ ...d, inboxes: inboxes ?? [] });
  }

  return NextResponse.json(orders);
}
