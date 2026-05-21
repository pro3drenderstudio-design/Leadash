import { NextRequest, NextResponse } from "next/server";
import { requireVendorAuth } from "@/lib/vendor/auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireVendorAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = createAdminClient();

  const { data: domain } = await db
    .from("outreach_domains")
    .select("domain, inbox_provider")
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

  const rows = [
    ["inbox_id", "email_address", "domain", "password", "verification_txt", "dkim_sel1_cname_target", "dkim_sel2_cname_target"],
    ...(inboxes ?? []).map((i: { id: string; email_address: string }) => [
      i.id, i.email_address, domain.domain, "", "", "", "",
    ]),
  ];

  const csv = rows.map(r => r.map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="order-${domain.domain}-inboxes.csv"`,
    },
  });
}
