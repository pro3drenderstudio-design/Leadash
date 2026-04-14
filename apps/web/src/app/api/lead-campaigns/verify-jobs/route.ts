import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// GET /api/lead-campaigns/verify-jobs
// Returns past bulk verification jobs for the workspace (90-day retention).
// Excludes `emails` and `results` columns — those are fetched per-job for downloads.
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("lead_verification_jobs")
    .select("id, status, total, processed, safe, invalid, catch_all, risky, dangerous, disposable, unknown, credits_used, error, completed_at, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}
