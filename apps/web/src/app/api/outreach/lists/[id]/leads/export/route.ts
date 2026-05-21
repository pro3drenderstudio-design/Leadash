import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";

const EXPORT_LIMIT = 50_000;

// GET /api/outreach/lists/[id]/leads/export
// Returns all leads matching the current filter (no pagination) for CSV download.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;
  const { id: listId } = await params;

  const sp      = req.nextUrl.searchParams;
  const search  = (sp.get("search") ?? "").trim();
  const status  = sp.get("status") ?? "all";
  const sortCol = ["email","first_name","company","verification_status","verification_score","created_at"].includes(sp.get("sort") ?? "")
    ? sp.get("sort")!
    : "created_at";
  const order   = sp.get("order") === "asc";

  const db = createAdminClient();

  const { data: list } = await db.from("outreach_lists").select("id").eq("id", listId).eq("workspace_id", workspaceId).single();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  let q = db
    .from("outreach_leads")
    .select("id,email,first_name,last_name,company,title,website,status,verification_status,verification_score,verified_at,first_line,custom_fields,created_at")
    .eq("list_id", listId)
    .eq("workspace_id", workspaceId);

  if (search) {
    q = q.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`);
  }

  switch (status) {
    case "deliverable": q = q.in("verification_status", ["safe","valid","verified_external"]); break;
    case "catch_all":   q = q.eq("verification_status", "catch_all");  break;
    case "unknown":     q = q.eq("verification_status", "unknown");    break;
    case "invalid":     q = q.in("verification_status", ["invalid","dangerous","disposable","risky"]); break;
    case "unverified":  q = q.is("verified_at", null); break;
  }

  const { data: leads, error } = await q
    .order(sortCol, { ascending: order })
    .limit(EXPORT_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: leads ?? [] });
}
