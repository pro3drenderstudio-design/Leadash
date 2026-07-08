import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("id, role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, admin, adminClient };
}

// GET /api/admin/outreach/inboxes/[id]
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: inbox, error }, { data: sends7d }] = await Promise.all([
    ctx.adminClient
      .from("outreach_inboxes")
      .select("*, workspaces!inner (name)")
      .eq("id", id)
      .single(),

    ctx.adminClient
      .from("outreach_warmup_sends")
      .select("id, sent_at, replied_at, rescued_from_spam")
      .eq("from_inbox_id", id)
      .gte("sent_at", sevenDaysAgo),
  ]);

  if (error || !inbox) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });

  type WsRow = { name: string };
  const ws = inbox.workspaces as unknown as WsRow | null;
  const { workspaces: _w, ...rest } = inbox;

  type WarmupRow = { sent_at: string; replied_at: string | null; rescued_from_spam: boolean | null };
  const typedSends = (sends7d ?? []) as WarmupRow[];
  const warmupSends7d   = typedSends.length;
  const warmupReplies7d = typedSends.filter(s => s.replied_at).length;

  return NextResponse.json({
    inbox: { ...rest, workspace_name: ws?.name ?? "" },
    warmup_sends_7d:   warmupSends7d,
    warmup_replies_7d: warmupReplies7d,
  });
}

// PATCH /api/admin/outreach/inboxes/[id]
// actions: clear_error | reset_status | update_smtp_host | toggle_warmup
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json() as { action: string; smtp_host?: string; status?: string };

  const { action } = body;

  if (action === "clear_error") {
    const { error } = await ctx.adminClient
      .from("outreach_inboxes")
      .update({ last_error: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    console.log(`[admin:outreach] clear_error inbox=${id} by admin=${ctx.user.id}`);
    return NextResponse.json({ ok: true });
  }

  if (action === "reset_status") {
    const { error } = await ctx.adminClient
      .from("outreach_inboxes")
      .update({ status: "active", last_error: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    console.log(`[admin:outreach] reset_status inbox=${id} by admin=${ctx.user.id}`);
    return NextResponse.json({ ok: true });
  }

  if (action === "update_smtp_host") {
    const { smtp_host } = body;
    if (!smtp_host?.trim()) return NextResponse.json({ error: "smtp_host required" }, { status: 400 });
    const { error } = await ctx.adminClient
      .from("outreach_inboxes")
      .update({ smtp_host: smtp_host.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    console.log(`[admin:outreach] update_smtp_host inbox=${id} smtp_host=${smtp_host} by admin=${ctx.user.id}`);
    return NextResponse.json({ ok: true });
  }

  if (action === "toggle_warmup") {
    const { data: inbox } = await ctx.adminClient
      .from("outreach_inboxes")
      .select("warmup_enabled")
      .eq("id", id)
      .single();
    if (!inbox) return NextResponse.json({ error: "Inbox not found" }, { status: 404 });
    const newVal = !(inbox.warmup_enabled as boolean);
    const { error } = await ctx.adminClient
      .from("outreach_inboxes")
      .update({ warmup_enabled: newVal, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    console.log(`[admin:outreach] toggle_warmup inbox=${id} warmup_enabled=${newVal} by admin=${ctx.user.id}`);
    return NextResponse.json({ ok: true, warmup_enabled: newVal });
  }

  if (action === "disable") {
    const { error } = await ctx.adminClient
      .from("outreach_inboxes")
      .update({ status: "disabled", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    console.log(`[admin:outreach] disable inbox=${id} by admin=${ctx.user.id}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
