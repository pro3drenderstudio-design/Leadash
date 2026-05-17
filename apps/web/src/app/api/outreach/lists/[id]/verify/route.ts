import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";
import { enqueueVerifyBulk } from "@/lib/queue";

const CREDITS_PER_VERIFY = 0.5;

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

  const pendingCount    = count ?? 0;
  const creditsRequired = Math.round(pendingCount * CREDITS_PER_VERIFY * 10) / 10;

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

  const { data: list } = await db
    .from("outreach_lists")
    .select("id")
    .eq("id", listId)
    .eq("workspace_id", workspaceId)
    .single();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const adminDb = createAdminClient();

  // Return existing job if one is already running for this list
  const { data: existing } = await adminDb
    .from("lead_verification_jobs")
    .select("id, status")
    .eq("workspace_id", workspaceId)
    .eq("list_id", listId)
    .in("status", ["pending", "running"])
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ job_id: existing.id, already_running: true }, { status: 202 });
  }

  // Count pending + unknown leads
  const { count } = await adminDb
    .from("outreach_leads")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId)
    .eq("workspace_id", workspaceId)
    .in("verification_status", ["pending", "unknown"]);

  const pendingCount = count ?? 0;
  if (pendingCount === 0) {
    return NextResponse.json({ error: "No pending leads to verify" }, { status: 400 });
  }

  const totalCost = Math.round(pendingCount * CREDITS_PER_VERIFY * 10) / 10;

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
      type:         "consume",
      amount:       totalCost,
      description:  `Email verification — ${pendingCount} lead${pendingCount !== 1 ? "s" : ""} in list`,
    }),
  ]);

  // Create the job row
  const { data: jobRow, error: jobErr } = await adminDb
    .from("lead_verification_jobs")
    .insert({
      workspace_id:      workspaceId,
      list_id:           listId,
      status:            "pending",
      total:             pendingCount,
      processed:         0,
      safe:              0,
      invalid:           0,
      catch_all:         0,
      risky:             0,
      dangerous:         0,
      disposable:        0,
      unknown:           0,
      credits_used:      totalCost,
      credits_deducted:  totalCost,
      refunded:          0,
    })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    // Refund on job creation failure
    await adminDb.rpc("refund_lead_credits", { p_workspace_id: workspaceId, p_amount: totalCost }).catch(() => {});
    return NextResponse.json({ error: "Failed to create verification job" }, { status: 500 });
  }

  // Enqueue to BullMQ → VPS worker picks it up
  try {
    await enqueueVerifyBulk(jobRow.id, workspaceId);
  } catch (err) {
    await adminDb.from("lead_verification_jobs")
      .update({ status: "failed", error: "Queue unavailable — Redis may be down" })
      .eq("id", jobRow.id);
    await adminDb.rpc("refund_lead_credits", { p_workspace_id: workspaceId, p_amount: totalCost }).catch(() => {});
    return NextResponse.json({ error: "Failed to enqueue job" }, { status: 500 });
  }

  return NextResponse.json(
    { job_id: jobRow.id, total: pendingCount, credits_deducted: totalCost },
    { status: 202 },
  );
}
