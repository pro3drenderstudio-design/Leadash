import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// GET /api/lead-campaigns/enrich-jobs
// Returns past AI enrichment jobs for the workspace (90-day retention).
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("lead_enrichment_jobs")
    .select("id, total, prompt, credits_used, completed_at, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}
