import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import leadsDb from "@/lib/postgres/leads-db";
import type { DiscoverExportRequest } from "@/types/discover";

const CREDITS_PER_LEAD = 0.5;

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  const body: DiscoverExportRequest = await req.json();
  const { ids, format, campaign_id, campaign_name } = body;

  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: "No leads selected" }, { status: 400 });
  if (ids.length > 2500)
    return NextResponse.json({ error: "Max 2500 leads per export" }, { status: 400 });

  const adminDb = createAdminClient();

  // Fetch existing reveals
  const { data: revealRows } = await adminDb
    .from("discover_reveals")
    .select("person_id, email, phone, email_status")
    .eq("workspace_id", workspaceId)
    .in("person_id", ids);

  type RevealRow = { person_id: string; email: string | null; phone: string | null; email_status: string | null };
  const revealMap = new Map<string, RevealRow>(
    ((revealRows ?? []) as RevealRow[]).map(r => [r.person_id, r])
  );

  const newIds = ids.filter(id => !revealMap.has(id));
  const totalCost = Math.ceil(newIds.length * CREDITS_PER_LEAD * 10) / 10;

  // Credit check for unrevealed leads
  if (newIds.length > 0) {
    const { data: ws } = await adminDb
      .from("workspaces")
      .select("lead_credits_balance")
      .eq("id", workspaceId)
      .single();

    const balance = (ws?.lead_credits_balance as number) ?? 0;
    if (balance < totalCost)
      return NextResponse.json({ error: "Insufficient credits", balance, required: totalCost }, { status: 402 });
  }

  // Fetch full data for all IDs from VPS
  type PersonRow = {
    id: string; first_name: string | null; last_name: string | null;
    title: string | null; seniority: string | null; department: string | null;
    linkedin_url: string | null; email: string | null; email_status: string | null;
    phone: string | null; country: string | null; state: string | null; city: string | null;
    company_name: string | null; company_domain: string | null;
    company_industry: string | null; company_size: string | null;
  };

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const people = await leadsDb.unsafe<PersonRow[]>(`
    SELECT
      p.id, p.first_name, p.last_name, p.title, p.seniority, p.department,
      p.linkedin_url, p.email, p.email_status, p.phone,
      p.country, p.state, p.city,
      c.name AS company_name, c.domain AS company_domain,
      c.industry AS company_industry, c.size_range AS company_size
    FROM discover_people p
    LEFT JOIN discover_companies c ON c.id = p.company_id
    WHERE p.id IN (${placeholders})
  `, ids as never[]);

  // Merge reveal data (use revealed email/phone if available)
  const mergedPeople = people.map(p => {
    const rev = revealMap.get(p.id);
    return {
      ...p,
      email:        rev ? rev.email        : p.email,
      phone:        rev ? rev.phone        : p.phone,
      email_status: rev ? rev.email_status : p.email_status,
    };
  });

  // Deduct credits and reveal new IDs
  if (newIds.length > 0 && totalCost > 0) {
    const newRevealRows = mergedPeople
      .filter(p => newIds.includes(p.id))
      .map(p => ({
        workspace_id: workspaceId,
        person_id:    p.id,
        email:        p.email   ?? null,
        phone:        p.phone   ?? null,
        email_status: p.email_status ?? null,
      }));

    await Promise.all([
      adminDb.rpc("deduct_lead_credits", { p_workspace_id: workspaceId, p_amount: totalCost }),
      adminDb.from("lead_credit_transactions").insert({
        workspace_id: workspaceId,
        type:         "debit",
        amount:       totalCost,
        description:  `Discover export — ${ids.length} lead${ids.length !== 1 ? "s" : ""}`,
      }),
      newRevealRows.length > 0
        ? adminDb.from("discover_reveals").upsert(newRevealRows, { onConflict: "workspace_id,person_id", ignoreDuplicates: true })
        : Promise.resolve(),
    ]);
  }

  // Mark all as exported
  await adminDb
    .from("discover_reveals")
    .update({ exported_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .in("person_id", ids);

  if (format === "csv") {
    const rows = mergedPeople.map((p) =>
      [
        p.first_name ?? "", p.last_name  ?? "", p.title      ?? "",
        p.seniority  ?? "", p.email      ?? "", p.email_status ?? "",
        p.phone      ?? "", p.linkedin_url ?? "",
        p.company_name ?? "", p.company_domain ?? "",
        p.company_industry ?? "", p.company_size ?? "",
        p.city ?? "", p.state ?? "", p.country ?? "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );

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
    // Upsert leads into outreach_leads using a dedicated Discover list
    let listId: string | null = null;
    const { data: existingList } = await adminDb
      .from("outreach_lists")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("name", "Discover Imports")
      .maybeSingle();

    if (existingList) {
      listId = existingList.id;
    } else {
      const { data: newList } = await adminDb
        .from("outreach_lists")
        .insert({ workspace_id: workspaceId, name: "Discover Imports" })
        .select("id")
        .single();
      listId = newList?.id ?? null;
    }

    const leads = mergedPeople.map((p) => ({
      workspace_id: workspaceId,
      list_id:      listId,
      first_name:   p.first_name   ?? null,
      last_name:    p.last_name    ?? null,
      email:        p.email        ?? null,
      title:        p.title        ?? null,
      company:      p.company_name ?? null,
      linkedin_url: p.linkedin_url ?? null,
      country:      p.country      ?? null,
      city:         p.city         ?? null,
      status:       "active",
    }));

    const { data: insertedLeads, error: insertError } = await adminDb
      .from("outreach_leads")
      .upsert(leads, { onConflict: "workspace_id,email", ignoreDuplicates: false })
      .select("id, email");

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

    // If campaign_id provided, create enrollments directly
    if (campaign_id && insertedLeads?.length) {
      const { data: existing } = await adminDb
        .from("outreach_enrollments")
        .select("lead_id")
        .eq("campaign_id", campaign_id);

      const enrolledSet = new Set((existing ?? []).map((e: { lead_id: string }) => e.lead_id));
      const toEnroll = insertedLeads.filter((l: { id: string }) => !enrolledSet.has(l.id));

      if (toEnroll.length > 0) {
        await adminDb.from("outreach_enrollments").insert(
          toEnroll.map((l: { id: string }) => ({
            workspace_id: workspaceId,
            campaign_id,
            lead_id:      l.id,
            ab_variant:   Math.random() < 0.5 ? "a" : "b",
          }))
        );
      }
    }

    return NextResponse.json({
      ok:           true,
      leads_added:  insertedLeads?.length ?? 0,
      credits_used: totalCost,
    });
  }

  return NextResponse.json({ error: "Invalid format" }, { status: 400 });
}
