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

// GET /api/admin/outreach/inboxes
// Query params: search, status, has_error, warmup, page
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp       = req.nextUrl.searchParams;
  const search   = sp.get("search")?.trim() || null;
  const status   = sp.get("status")          || null;
  const hasError = sp.get("has_error");
  const warmup   = sp.get("warmup");
  const page     = Math.max(0, parseInt(sp.get("page") ?? "0") || 0);
  const PAGE     = 50;

  let q = ctx.adminClient
    .from("outreach_inboxes")
    .select(
      `id, email_address, label, provider, status, last_error,
       smtp_host, smtp_user, warmup_enabled, warmup_current_daily, warmup_target_daily,
       warmup_ends_at, daily_send_limit, domain_id, created_at, updated_at, workspace_id,
       workspaces!inner (name)`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(page * PAGE, (page + 1) * PAGE - 1);

  if (search)            q = q.ilike("email_address", `%${search}%`);
  if (status)            q = q.eq("status", status);
  if (hasError === "true")  q = q.not("last_error", "is", null);
  if (hasError === "false") q = q.is("last_error", null);
  if (warmup === "true")    q = q.eq("warmup_enabled", true);
  if (warmup === "false")   q = q.eq("warmup_enabled", false);

  const { data: inboxes, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type WsRow     = { name: string };
  type InboxRow  = { workspaces: unknown; [key: string]: unknown };
  const typed    = (inboxes ?? []) as InboxRow[];
  const mapped   = typed.map(i => {
    const ws = i.workspaces as WsRow | null;
    const { workspaces: _w, ...rest } = i;
    return { ...rest, workspace_name: ws?.name ?? "" };
  });

  return NextResponse.json({ inboxes: mapped, total: count ?? 0, page });
}
