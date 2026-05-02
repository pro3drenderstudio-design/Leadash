import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

// GET /api/admin/notifications?status=active|resolved|all&type=infra&severity=critical&page=0&limit=25
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status   = searchParams.get("status")   ?? "active";
  const type     = searchParams.get("type")      ?? null;
  const severity = searchParams.get("severity")  ?? null;
  const page     = Math.max(0, parseInt(searchParams.get("page")  ?? "0"));
  const limit    = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25")));

  const db = ctx.adminClient;

  let q = db
    .from("notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (status === "active")   q = q.is("resolved_at", null);
  if (status === "resolved") q = q.not("resolved_at", "is", null);
  if (type)     q = q.eq("type", type);
  if (severity) q = q.eq("severity", severity);

  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Unread count (active + unread)
  const { count: unreadCount } = await db
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("resolved_at", null)
    .is("read_at", null);

  return NextResponse.json({
    notifications: data ?? [],
    total:         count ?? 0,
    unread:        unreadCount ?? 0,
    page,
    limit,
  });
}

// PATCH /api/admin/notifications
// Body: { ids: string[], action: "resolve" | "mark_read" }
//   or  { action: "resolve_all" | "mark_all_read" }
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { ids?: string[]; action: string };
  const { action, ids } = body;
  const db = ctx.adminClient;
  const now = new Date().toISOString();

  if (action === "resolve" && ids?.length) {
    await db.from("notifications")
      .update({ resolved_at: now })
      .in("id", ids)
      .is("resolved_at", null);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_read" && ids?.length) {
    await db.from("notifications")
      .update({ read_at: now })
      .in("id", ids)
      .is("read_at", null);
    return NextResponse.json({ ok: true });
  }

  if (action === "resolve_all") {
    await db.from("notifications")
      .update({ resolved_at: now })
      .is("resolved_at", null);
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_all_read") {
    await db.from("notifications")
      .update({ read_at: now })
      .is("read_at", null);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
