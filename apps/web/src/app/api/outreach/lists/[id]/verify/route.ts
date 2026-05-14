import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyEmails } from "@/lib/lead-campaigns/reoon";

const CREDITS_PER_VERIFY = 0.5;
const ALLOWED_STATUSES   = new Set(["safe", "valid", "catch_all", "verified_external"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: listId } = await params;

  const body = await req.json().catch(() => ({})) as { lead_ids?: string[] };

  // Verify list belongs to workspace
  const { data: list } = await db
    .from("outreach_lists")
    .select("id")
    .eq("id", listId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  // Fetch pending leads (or specific lead_ids if provided)
  const adminDb = createAdminClient();
  let query = adminDb
    .from("outreach_leads")
    .select("id, email, verification_status")
    .eq("list_id", listId)
    .eq("workspace_id", workspaceId)
    .eq("verification_status", "pending");

  if (body.lead_ids?.length) {
    query = adminDb
      .from("outreach_leads")
      .select("id, email, verification_status")
      .eq("list_id", listId)
      .eq("workspace_id", workspaceId)
      .in("id", body.lead_ids)
      .eq("verification_status", "pending");
  }

  type LeadRow = { id: string; email: string; verification_status: string };
  const { data: leads } = await query;
  const typedLeads = (leads ?? []) as LeadRow[];
  if (!typedLeads.length) return NextResponse.json({ verified: 0, safe: 0, invalid: 0, credits_used: 0 });

  const totalCost = Math.round(typedLeads.length * CREDITS_PER_VERIFY * 10) / 10;

  // Credit check
  const { data: ws } = await adminDb
    .from("workspaces")
    .select("lead_credits_balance")
    .eq("id", workspaceId)
    .single();
  const balance = (ws?.lead_credits_balance as number) ?? 0;
  if (balance < totalCost) {
    return NextResponse.json(
      { error: "Insufficient credits", balance, required: totalCost },
      { status: 402 },
    );
  }

  // Deduct credits upfront
  await Promise.all([
    adminDb.rpc("deduct_lead_credits", { p_workspace_id: workspaceId, p_amount: totalCost }),
    adminDb.from("lead_credit_transactions").insert({
      workspace_id: workspaceId,
      type:         "debit",
      amount:       totalCost,
      description:  `Email verification — ${typedLeads.length} lead${typedLeads.length !== 1 ? "s" : ""} in list`,
    }),
  ]);

  // Run Reoon verification
  const apiKey = process.env.REOON_API_KEY ?? "";
  const emails = typedLeads.map(l => l.email);
  const results = await verifyEmails(apiKey, emails);

  // Map results back to lead IDs
  const emailToId = new Map(typedLeads.map(l => [l.email, l.id]));
  const now = new Date().toISOString();

  let safeCount   = 0;
  let invalidCount = 0;

  const updates = results.map(r => ({
    id:                  emailToId.get(r.email)!,
    verification_status: r.status as string,
    verification_score:  r.score,
    verified_at:         now,
  })).filter(u => u.id);

  // Batch update results
  const BATCH = 100;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await adminDb.from("outreach_leads").upsert(batch, { onConflict: "id" });
  }

  for (const r of results) {
    if (ALLOWED_STATUSES.has(r.status)) safeCount++;
    else invalidCount++;
  }

  return NextResponse.json({
    verified:     results.length,
    safe:         safeCount,
    invalid:      invalidCount,
    credits_used: totalCost,
  });
}
