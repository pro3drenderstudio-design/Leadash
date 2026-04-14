import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { enqueueVerifyBulk } from "@/lib/queue";

const MAX_EMAILS = 50_000;
const COST_PER   = 0.5;

// POST /api/lead-campaigns/verify-bulk
// Validates, deducts credits, inserts a pending job row, enqueues to BullMQ.
// Returns { job_id } immediately — the client polls verify-jobs/[id] for progress.
export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { emails } = await req.json() as { emails?: string[] };
  if (!Array.isArray(emails) || !emails.length)
    return NextResponse.json({ error: "emails array is required" }, { status: 400 });
  if (emails.length > MAX_EMAILS)
    return NextResponse.json({ error: `Maximum ${MAX_EMAILS.toLocaleString()} emails per batch` }, { status: 400 });

  const clean = [...new Set(emails.map((e: string) => e.trim().toLowerCase()).filter(e => e.includes("@")))];
  const cost  = clean.length * COST_PER;

  // Check and deduct credits atomically
  const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
  if (!ws || (ws.lead_credits_balance as number) < cost)
    return NextResponse.json({ error: `Insufficient credits. Need ${cost}, have ${ws?.lead_credits_balance ?? 0}.` }, { status: 402 });

  await db.from("workspaces")
    .update({ lead_credits_balance: (ws.lead_credits_balance as number) - cost })
    .eq("id", workspaceId);

  await db.from("lead_credit_transactions").insert({
    workspace_id: workspaceId,
    amount:       -cost,
    type:         "consume",
    description:  `Bulk email verification — ${clean.length} emails`,
  });

  // Insert pending job row (worker reads emails from here)
  const expires = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const { data: jobRow, error: jobErr } = await db
    .from("lead_verification_jobs")
    .insert({
      workspace_id:  workspaceId,
      status:        "pending",
      total:         clean.length,
      processed:     0,
      safe:          0,
      invalid:       0,
      catch_all:     0,
      risky:         0,
      dangerous:     0,
      disposable:    0,
      unknown:       0,
      credits_used:  cost,
      emails:        clean,         // worker reads this
      expires_at:    expires,
    })
    .select("id")
    .single();

  if (jobErr || !jobRow)
    return NextResponse.json({ error: jobErr?.message ?? "Failed to create job" }, { status: 500 });

  // Enqueue — worker picks it up within ~1s
  try {
    await enqueueVerifyBulk(jobRow.id, workspaceId);
  } catch (err) {
    // Mark job failed so UI doesn't spin forever
    await db.from("lead_verification_jobs")
      .update({ status: "failed", error: err instanceof Error ? err.message : "Queue unavailable" })
      .eq("id", jobRow.id);
    return NextResponse.json({ error: "Failed to enqueue job — Redis may be unavailable" }, { status: 500 });
  }

  return NextResponse.json({ job_id: jobRow.id }, { status: 202 });
}
