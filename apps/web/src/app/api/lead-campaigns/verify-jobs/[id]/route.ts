import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

const CREDITS_PER = 0.5;

// GET /api/lead-campaigns/verify-jobs/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("lead_verification_jobs")
    .select("id, status, total, processed, safe, invalid, catch_all, risky, dangerous, disposable, unknown, credits_used, credits_deducted, refunded, list_id, error, results, completed_at, expires_at, created_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// DELETE /api/lead-campaigns/verify-jobs/[id]
// Cancels a running/pending job and refunds credits for unprocessed leads.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: job } = await db
    .from("lead_verification_jobs")
    .select("id, status, processed, total, credits_deducted, refunded")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["pending", "queued", "running"].includes(job.status as string)) {
    return NextResponse.json({ error: "Job is not cancellable" }, { status: 400 });
  }

  const processed   = (job.processed as number) ?? 0;
  const total       = (job.total     as number) ?? 0;
  const unprocessed = Math.max(0, total - processed);
  const refundNow   = Math.round(unprocessed * CREDITS_PER * 10) / 10;

  if (refundNow > 0) {
    await Promise.all([
      db.rpc("refund_lead_credits", { p_workspace_id: workspaceId, p_amount: refundNow }),
      db.from("lead_credit_transactions").insert({
        workspace_id: workspaceId,
        type:         "refund",
        amount:       refundNow,
        description:  `Verification cancelled — ${unprocessed} unprocessed lead${unprocessed !== 1 ? "s" : ""} refunded`,
      }),
    ]);
  }

  await db.from("lead_verification_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, refunded: refundNow });
}
