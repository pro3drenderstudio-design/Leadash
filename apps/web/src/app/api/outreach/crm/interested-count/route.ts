import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

// GET /api/outreach/crm/interested-count
// Returns count of CRM threads AI-classified as "interested" that haven't been manually reviewed.
export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { count } = await db
    .from("outreach_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("crm_status", "interested");

  return NextResponse.json({ count: count ?? 0 });
}
