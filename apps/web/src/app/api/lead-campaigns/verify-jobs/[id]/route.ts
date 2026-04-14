import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// GET /api/lead-campaigns/verify-jobs/[id]
// Returns job status + progress for polling, and full results once done.
// The `results` and `emails` columns are excluded from the list endpoint
// but included here so the client can render the table and download CSV.
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
    .select("id, status, total, processed, safe, invalid, catch_all, risky, dangerous, disposable, unknown, credits_used, error, results, completed_at, expires_at, created_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
