import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id } = await params;

  const { list_id } = await req.json();

  // Fetch all unexported campaign leads
  const { data: campaignLeads } = await db
    .from("lead_campaign_leads")
    .select("id, email, verification_status")
    .eq("campaign_id", id)
    .eq("workspace_id", workspaceId)
    .is("added_to_list_id", null);

  if (!campaignLeads?.length) {
    return NextResponse.json({
      total: 0,
      by_status: {},
      duplicates: 0,
      duplicate_lists: [],
      new_leads: 0,
    });
  }

  // Count by verification_status
  const byStatus: Record<string, number> = {};
  for (const l of campaignLeads) {
    const s = l.verification_status ?? "pending";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  const emails = campaignLeads.map((l: { email: string }) => l.email).filter(Boolean);

  // Find duplicates across ALL workspace lists (not just target)
  const { data: existingLeads } = await db
    .from("outreach_leads")
    .select("email, list_id, outreach_lists(name)")
    .eq("workspace_id", workspaceId)
    .in("email", emails);

  // Build duplicate info: which emails exist and in which lists
  const dupMap = new Map<string, string[]>(); // email → list names
  for (const row of (existingLeads ?? []) as { email: string; list_id: string | null; outreach_lists: { name: string } | null }[]) {
    const listName = row.outreach_lists?.name ?? row.list_id ?? "Unknown list";
    const existing = dupMap.get(row.email) ?? [];
    if (!existing.includes(listName)) existing.push(listName);
    dupMap.set(row.email, existing);
  }

  // Tally duplicate list names
  const listNameCount: Record<string, number> = {};
  for (const listNames of dupMap.values()) {
    for (const name of listNames) {
      listNameCount[name] = (listNameCount[name] ?? 0) + 1;
    }
  }

  const duplicateLists = Object.entries(listNameCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const duplicateEmails = dupMap.size;

  // Count new leads that would be added to the target list
  let alreadyInTarget = 0;
  if (list_id) {
    const targetDups = (existingLeads ?? []).filter(
      (r: { list_id: string | null }) => r.list_id === list_id
    );
    alreadyInTarget = new Set(targetDups.map((r: { email: string }) => r.email)).size;
  }

  const validStatuses = ["safe", "valid", "catch_all"];
  const validCount = campaignLeads.filter(
    (l: { verification_status: string | null }) => validStatuses.includes(l.verification_status ?? "")
  ).length;

  return NextResponse.json({
    total: campaignLeads.length,
    by_status: byStatus,
    valid_count: validCount,
    duplicates: duplicateEmails,
    duplicate_lists: duplicateLists,
    already_in_target: alreadyInTarget,
    new_leads: campaignLeads.length - alreadyInTarget,
  });
}
