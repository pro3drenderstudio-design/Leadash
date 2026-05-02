import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import type { DiscoverExportRequest } from "@/types/discover";

const CREDITS_PER_LEAD = 0.5;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const body: DiscoverExportRequest = await req.json();
  const { ids, format, campaign_name } = body;

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "No leads selected" }, { status: 400 });
  if (ids.length > 2500)
    return NextResponse.json({ error: "Max 2500 leads per export" }, { status: 400 });

  const totalCost = Math.ceil(ids.length * CREDITS_PER_LEAD * 10) / 10;

  // Check balance
  const adminDb = createAdminClient();
  const { data: ws } = await adminDb
    .from("workspaces")
    .select("lead_credits_balance")
    .eq("id", workspaceId)
    .single();

  const balance = ws?.lead_credits_balance ?? 0;
  if (balance < totalCost)
    return NextResponse.json({ error: "Insufficient credits", balance, required: totalCost }, { status: 402 });

  // Fetch full unmasked data
  const { data: people, error } = await adminDb
    .from("discover_people")
    .select(`
      id, first_name, last_name, title, seniority, department,
      linkedin_url, email, email_status, phone, country, state, city,
      discover_companies!company_id (name, domain, industry, size_range)
    `)
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduct credits atomically
  await adminDb
    .from("workspaces")
    .update({ lead_credits_balance: balance - totalCost })
    .eq("id", workspaceId);

  await adminDb.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    type:         "debit",
    amount:       totalCost,
    description:  `Discover export — ${ids.length} lead${ids.length !== 1 ? "s" : ""}`,
  });

  if (format === "csv") {
    const rows = (people ?? []).map((p: Record<string, unknown>) => {
      const co = (p.discover_companies as Record<string, string | null> | null) ?? {};
      return [
        p.first_name ?? "",
        p.last_name  ?? "",
        p.title      ?? "",
        p.seniority  ?? "",
        p.email      ?? "",
        p.email_status ?? "",
        p.phone      ?? "",
        p.linkedin_url ?? "",
        co.name      ?? "",
        co.domain    ?? "",
        co.industry  ?? "",
        co.size_range ?? "",
        p.city       ?? "",
        p.state      ?? "",
        p.country    ?? "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });

    const csv = [
      "First Name,Last Name,Title,Seniority,Email,Email Status,Phone,LinkedIn URL,Company,Domain,Industry,Company Size,City,State,Country",
      ...rows,
    ].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type":        "text/csv",
        "Content-Disposition": `attachment; filename="leadash-discover-${Date.now()}.csv"`,
      },
    });
  }

  if (format === "campaign") {
    if (!campaign_name?.trim())
      return NextResponse.json({ error: "campaign_name is required" }, { status: 400 });

    // Insert into lead_lists (leads pool) for use in campaigns
    const leads = (people ?? []).map((p: Record<string, unknown>) => {
      const co = (p.discover_companies as Record<string, string | null> | null) ?? {};
      return {
        workspace_id: workspaceId,
        first_name:   p.first_name ?? null,
        last_name:    p.last_name  ?? null,
        email:        p.email      ?? null,
        title:        p.title      ?? null,
        company:      co.name      ?? null,
        linkedin_url: p.linkedin_url ?? null,
        country:      p.country    ?? null,
        city:         p.city       ?? null,
        source:       "discover",
      };
    });

    const { error: insertError } = await adminDb
      .from("leads")
      .upsert(leads, { onConflict: "workspace_id,email", ignoreDuplicates: true });

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    return NextResponse.json({ ok: true, leads_added: leads.length, credits_used: totalCost });
  }

  return NextResponse.json({ error: "Invalid format" }, { status: 400 });
}
