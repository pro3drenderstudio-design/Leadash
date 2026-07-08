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

// GET /api/admin/outreach/queue
// Returns error inboxes + recent failed/bounced sends
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart    = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();

  const [{ data: errorInboxes }, { data: failedSends }] = await Promise.all([
    ctx.adminClient
      .from("outreach_inboxes")
      .select("id, email_address, workspace_id, status, last_error, provider, smtp_host, warmup_enabled, workspaces!inner (name)")
      .not("last_error", "is", null)
      .order("updated_at", { ascending: false }),

    ctx.adminClient
      .from("outreach_sends")
      .select("id, workspace_id, inbox_id, to_email, status, created_at, bounced_at, campaign_id, workspaces!inner (name)")
      .in("status", ["failed", "bounced"])
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  type WsRow      = { name: string };
  type InboxRow   = { id: string; email_address: string; workspace_id: string; status: string; last_error: string | null; provider: string | null; smtp_host: string | null; warmup_enabled: boolean | null; workspaces: unknown };
  type SendRow    = { id: string; workspace_id: string; inbox_id: string | null; to_email: string; status: string; created_at: string; bounced_at: string | null; campaign_id: string | null; workspaces: unknown };

  const typedErrorInboxes = (errorInboxes ?? []) as InboxRow[];
  const typedFailedSends  = (failedSends  ?? []) as SendRow[];

  const mappedErrorInboxes = typedErrorInboxes.map(i => {
    const ws = i.workspaces as WsRow | null;
    const { workspaces: _w, ...rest } = i;
    return { ...rest, workspace_name: ws?.name ?? "" };
  });

  const mappedSends = typedFailedSends.map(s => {
    const ws = s.workspaces as WsRow | null;
    const { workspaces: _w, ...rest } = s;
    return { ...rest, workspace_name: ws?.name ?? "" };
  });

  const failed30d    = mappedSends.filter(s => s.status === "failed").length;
  const bounced30d   = mappedSends.filter(s => s.status === "bounced").length;
  const failedToday  = mappedSends.filter(s => s.status === "failed"  && s.created_at >= todayStart).length;
  const bouncedToday = mappedSends.filter(s => s.status === "bounced" && (s.bounced_at ?? s.created_at) >= todayStart).length;

  // Group error inboxes by error pattern (first 80 chars of last_error)
  const errorPatterns: Record<string, number> = {};
  for (const i of mappedErrorInboxes) {
    const pattern = (i.last_error as string ?? "unknown").substring(0, 80);
    errorPatterns[pattern] = (errorPatterns[pattern] ?? 0) + 1;
  }
  const errorGroups = Object.entries(errorPatterns)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    summary: {
      error_inboxes:  mappedErrorInboxes.length,
      failed_30d:     failed30d,
      bounced_30d:    bounced30d,
      failed_today:   failedToday,
      bounced_today:  bouncedToday,
    },
    error_groups:  errorGroups,
    error_inboxes: mappedErrorInboxes,
    failed_sends:  mappedSends,
  });
}
