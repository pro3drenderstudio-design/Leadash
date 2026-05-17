import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyEmails } from "@/lib/lead-campaigns/reoon";

const CREDITS_PER_VERIFY = 0.5;
const ALLOWED_STATUSES   = new Set(["safe", "valid", "catch_all", "verified_external"]);
const BATCH_SIZE         = 500;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { id: listId } = await params;

  const { data: list } = await db
    .from("outreach_lists")
    .select("id")
    .eq("id", listId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const adminDb = createAdminClient();
  const { count } = await adminDb
    .from("outreach_leads")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId)
    .eq("workspace_id", workspaceId)
    .in("verification_status", ["pending", "unknown"]);

  const pendingCount      = count ?? 0;
  const creditsRequired   = Math.round(pendingCount * CREDITS_PER_VERIFY * 10) / 10;

  const { data: ws } = await adminDb
    .from("workspaces")
    .select("lead_credits_balance")
    .eq("id", workspaceId)
    .single();
  const balance = (ws?.lead_credits_balance as number) ?? 0;

  return NextResponse.json({ count: pendingCount, credits_required: creditsRequired, balance });
}

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

  // Fetch pending leads (or specific lead_ids if provided) — capped at BATCH_SIZE per call
  const adminDb = createAdminClient();
  // Include "unknown" alongside "pending" — unknowns were refunded and are retryable
  let query = adminDb
    .from("outreach_leads")
    .select("id, email, verification_status")
    .eq("list_id", listId)
    .eq("workspace_id", workspaceId)
    .in("verification_status", ["pending", "unknown"])
    .limit(BATCH_SIZE);

  if (body.lead_ids?.length) {
    const cappedIds = body.lead_ids.slice(0, BATCH_SIZE);
    query = adminDb
      .from("outreach_leads")
      .select("id, email, verification_status")
      .eq("list_id", listId)
      .eq("workspace_id", workspaceId)
      .in("id", cappedIds)
      .in("verification_status", ["pending", "unknown"])
      .limit(BATCH_SIZE);
  }

  type LeadRow = { id: string; email: string; verification_status: string };
  const { data: leads } = await query;
  const typedLeads = (leads ?? []) as LeadRow[];
  if (!typedLeads.length) return NextResponse.json({ verified: 0, safe: 0, invalid: 0, unknown: 0, credits_used: 0, refunded: 0 });

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

  let safeCount    = 0;
  let invalidCount = 0;
  let unknownCount = 0;

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
    else if (r.status === "unknown") unknownCount++;
    else invalidCount++;
  }

  // Refund credits for unknown results — Reoon doesn't charge for these
  const refundAmount = Math.round(unknownCount * CREDITS_PER_VERIFY * 10) / 10;
  if (refundAmount > 0) {
    await Promise.all([
      adminDb.rpc("refund_lead_credits", { p_workspace_id: workspaceId, p_amount: refundAmount }),
      adminDb.from("lead_credit_transactions").insert({
        workspace_id: workspaceId,
        type:         "credit",
        amount:       refundAmount,
        description:  `Verification refund — ${unknownCount} unknown result${unknownCount !== 1 ? "s" : ""}`,
      }),
    ]);
  }

  const creditsUsed = Math.round((totalCost - refundAmount) * 10) / 10;

  return NextResponse.json({
    verified:     results.length,
    safe:         safeCount,
    invalid:      invalidCount,
    unknown:      unknownCount,
    credits_used: creditsUsed,
    refunded:     refundAmount,
  });
}
