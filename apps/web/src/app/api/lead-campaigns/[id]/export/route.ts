import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { lead_ids, list_id, create_list_name, valid_only } = await req.json();

  if (!list_id && !create_list_name) {
    return NextResponse.json({ error: "list_id or create_list_name required" }, { status: 400 });
  }

  let targetListId = list_id;

  // Create new list if requested
  if (!targetListId && create_list_name) {
    const { data: newList, error } = await db
      .from("outreach_lists")
      .insert({ workspace_id: workspaceId, name: create_list_name })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    targetListId = newList.id;
  }

  // Fetch the campaign leads to export
  let query = db
    .from("lead_campaign_leads")
    .select("*")
    .eq("campaign_id", id)
    .eq("workspace_id", workspaceId)
    .is("added_to_list_id", null);

  if (lead_ids?.length) {
    query = query.in("id", lead_ids);
  }

  const { data: campaignLeads } = await query;
  if (!campaignLeads?.length) return NextResponse.json({ exported: 0, skipped_duplicate: 0 });

  // Get existing emails in target list to deduplicate
  type CampaignLead = { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null; website: string | null; personalized_line: string | null };
  const typedLeads = campaignLeads as CampaignLead[];
  const emails = typedLeads.map(l => l.email);
  const { data: existing } = await db
    .from("outreach_leads")
    .select("email")
    .eq("list_id", targetListId)
    .in("email", emails);

  const existingEmails = new Set((existing ?? []).map((l: { email: string }) => l.email));
  const toInsert = typedLeads.filter(l => !existingEmails.has(l.email));

  let exported = 0;
  const BATCH = 100;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { error } = await db.from("outreach_leads").insert(
      batch.map(l => ({
        workspace_id: workspaceId,
        list_id:      targetListId,
        email:        l.email,
        first_name:   l.first_name,
        last_name:    l.last_name,
        company:      l.company,
        title:        l.title,
        website:      l.website,
        status:       "active",
        custom_fields: l.personalized_line
          ? { personalized_line: l.personalized_line }
          : null,
      })),
    );
    if (!error) exported += batch.length;
  }

  // Mark campaign leads as exported
  if (toInsert.length > 0) {
    await db.from("lead_campaign_leads")
      .update({ added_to_list_id: targetListId, added_at: new Date().toISOString() })
      .in("id", toInsert.map(l => l.id));
  }

  return NextResponse.json({
    exported,
    skipped_duplicate: campaignLeads.length - toInsert.length,
    list_id: targetListId,
  });
}
