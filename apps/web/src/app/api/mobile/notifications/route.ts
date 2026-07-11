/**
 * GET   /api/mobile/notifications?page=0 — paginated feed (newest first) + unread_count.
 * PATCH /api/mobile/notifications         — mark read: { read_all: true } or { ids: [...] }.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace(req);
  if (!ctx.ok) return ctx.res;
  const { workspaceId, userId, db } = ctx;

  const page = Math.max(parseInt(req.nextUrl.searchParams.get("page") ?? "0", 10) || 0, 0);
  const from = page * PAGE_SIZE;

  const [feed, unread] = await Promise.all([
    db.from("mobile_notifications")
      .select("id, type, title, body, data, read_at, created_at", { count: "exact" })
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    db.from("mobile_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("workspace_id", workspaceId)
      .is("read_at", null),
  ]);

  if (feed.error) return NextResponse.json({ error: feed.error.message }, { status: 500 });

  return NextResponse.json({
    notifications: feed.data ?? [],
    total:         feed.count ?? 0,
    unread_count:  unread.count ?? 0,
    page,
    page_size:     PAGE_SIZE,
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireWorkspace(req);
  if (!ctx.ok) return ctx.res;
  const { workspaceId, userId, db } = ctx;

  const body = await req.json() as { read_all?: boolean; ids?: string[] };
  const now  = new Date().toISOString();

  let query = db.from("mobile_notifications")
    .update({ read_at: now })
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .is("read_at", null);

  if (body.read_all) {
    // no further filter — mark everything unread as read
  } else if (body.ids?.length) {
    query = query.in("id", body.ids);
  } else {
    return NextResponse.json({ error: "Pass read_all: true or ids: [...]" }, { status: 400 });
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
