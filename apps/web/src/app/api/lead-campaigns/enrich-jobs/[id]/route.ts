import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// GET /api/lead-campaigns/enrich-jobs/[id]
// Returns full results for a past enrichment job (for CSV download).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data, error } = await db
    .from("lead_enrichment_jobs")
    .select("id, total, results, prompt, completed_at")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
