import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { searchParams } = new URL(req.url);
  const type        = searchParams.get("type") ?? "";
  const workspace   = searchParams.get("workspace") ?? "";
  const cursor      = searchParams.get("cursor") ?? "";
  const limit       = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const db = createAdminClient();

  let query = db
    .from("admin_activity_log")
    .select("id, workspace_id, workspace_name, user_email, type, title, description, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (type)      query = query.eq("type", type);
  if (workspace) query = query.ilike("workspace_name", `%${workspace}%`);
  if (cursor)    query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items    = (data ?? []).slice(0, limit);
  const hasMore  = (data ?? []).length > limit;
  const nextCursor = hasMore ? items[items.length - 1].created_at : null;

  return NextResponse.json({ items, nextCursor });
}
