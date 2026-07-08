import { NextResponse } from "next/server";
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

// GET /api/admin/outreach/warmup
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart   = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();

  const [{ data: inboxes }, { data: sends7d }, { data: recentActivity }] = await Promise.all([
    ctx.adminClient
      .from("outreach_inboxes")
      .select("id, email_address, workspace_id, warmup_enabled, warmup_current_daily, warmup_target_daily, last_error, workspaces!inner (name)")
      .eq("warmup_enabled", true),

    ctx.adminClient
      .from("outreach_warmup_sends")
      .select("workspace_id, from_inbox_id, sent_at, replied_at, rescued_from_spam")
      .gte("sent_at", sevenDaysAgo)
      .limit(5000),

    ctx.adminClient
      .from("outreach_warmup_sends")
      .select("id, from_inbox_id, to_inbox_id, subject, sent_at, replied_at, rescued_from_spam")
      .gte("sent_at", sevenDaysAgo)
      .order("sent_at", { ascending: false })
      .limit(30),
  ]);

  type WsRow   = { name: string };
  type InboxRow = { workspace_id: string; last_error: string | null; workspaces: unknown };
  type SendRow  = { workspace_id: string; from_inbox_id: string; sent_at: string; replied_at: string | null; rescued_from_spam: boolean | null };

  const typedInboxes = (inboxes ?? []) as InboxRow[];
  const typedSends   = (sends7d ?? []) as SendRow[];

  // Per-workspace aggregation
  const wsMap: Record<string, {
    workspace_id: string; workspace_name: string;
    inbox_count: number; error_count: number;
    sends_today: number; sends_7d: number; replies_7d: number;
    last_send: string | null;
  }> = {};

  for (const i of typedInboxes) {
    const wsId   = i.workspace_id;
    const wsName = (i.workspaces as WsRow | null)?.name ?? "";
    if (!wsMap[wsId]) wsMap[wsId] = { workspace_id: wsId, workspace_name: wsName, inbox_count: 0, error_count: 0, sends_today: 0, sends_7d: 0, replies_7d: 0, last_send: null };
    wsMap[wsId].inbox_count++;
    if (i.last_error) wsMap[wsId].error_count++;
  }

  for (const s of typedSends) {
    const wsId = s.workspace_id;
    if (!wsMap[wsId]) continue;
    wsMap[wsId].sends_7d++;
    if (s.replied_at) wsMap[wsId].replies_7d++;
    if (s.sent_at >= todayStart) wsMap[wsId].sends_today++;
    if (!wsMap[wsId].last_send || s.sent_at > wsMap[wsId].last_send!) wsMap[wsId].last_send = s.sent_at;
  }

  const totalWarmupInboxes = typedInboxes.length;
  const errorInboxes       = typedInboxes.filter(i => i.last_error).length;
  const sendsToday         = typedSends.filter(s => s.sent_at >= todayStart).length;
  const sends7dTotal       = typedSends.length;
  const replies7d          = typedSends.filter(s => s.replied_at).length;
  const rescued7d          = typedSends.filter(s => s.rescued_from_spam).length;
  const replyRate          = sends7dTotal > 0 ? Math.round((replies7d / sends7dTotal) * 100) : 0;

  const byWorkspace = Object.values(wsMap).sort((a, b) => b.sends_today - a.sends_today);

  return NextResponse.json({
    summary: { total_warmup_inboxes: totalWarmupInboxes, error_inboxes: errorInboxes, sends_today: sendsToday, sends_7d: sends7dTotal, replies_7d: replies7d, rescued_7d: rescued7d, reply_rate: replyRate },
    by_workspace: byWorkspace,
    recent_activity: recentActivity ?? [],
  });
}
