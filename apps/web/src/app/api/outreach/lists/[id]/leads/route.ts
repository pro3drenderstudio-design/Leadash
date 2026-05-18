import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";

const PER_PAGE_MAX = 100;

// ─── GET /api/outreach/lists/[id]/leads ───────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;
  const { id: listId } = await params;

  const sp       = req.nextUrl.searchParams;
  const page     = Math.max(1, parseInt(sp.get("page")    ?? "1", 10));
  const perPage  = Math.min(PER_PAGE_MAX, Math.max(1, parseInt(sp.get("per_page") ?? "50", 10)));
  const search   = (sp.get("search") ?? "").trim();
  const status   = sp.get("status") ?? "all";
  const sortCol  = ["email","first_name","company","verification_status","verification_score","created_at"].includes(sp.get("sort") ?? "")
    ? sp.get("sort")!
    : "created_at";
  const order    = sp.get("order") === "asc" ? true : false;

  const db   = createAdminClient();
  const from = (page - 1) * perPage;
  const to   = from + perPage - 1;

  // Verify list belongs to workspace
  const { data: list } = await db.from("outreach_lists").select("id").eq("id", listId).eq("workspace_id", workspaceId).single();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  let q = db
    .from("outreach_leads")
    .select("id,email,first_name,last_name,company,title,website,status,verification_status,verification_score,verified_at,first_line,custom_fields,created_at", { count: "exact" })
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

  const { data: leads, count, error } = await q
    .order(sortCol, { ascending: order })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    leads:    leads ?? [],
    total:    count ?? 0,
    page,
    per_page: perPage,
    pages:    Math.ceil((count ?? 0) / perPage),
  });
}

// ─── DELETE /api/outreach/lists/[id]/leads ────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;
  const { id: listId } = await params;

  const { ids } = await req.json() as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const db = createAdminClient();

  const { error } = await db
    .from("outreach_leads")
    .delete()
    .in("id", ids)
    .eq("list_id", listId)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
