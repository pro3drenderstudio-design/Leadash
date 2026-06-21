import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ searchId: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;
  const { searchId } = await params;

  const { data: search, error } = await db
    .from("ai_prospect_searches")
    .select("id, query, model, status, error_message, total_generated, total_enriched, created_at")
    .eq("id", searchId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !search) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  const { data: results } = await db
    .from("ai_prospect_results")
    .select("*")
    .eq("search_id", searchId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ search, results: results ?? [] });
}
