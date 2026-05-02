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

// GET /api/admin/infrastructure
// Returns: latest snapshot, worker status, active alerts, workspaces near limit, 24h history
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = ctx.adminClient;

  const [
    { data: latestSnap },
    { data: history },
    { data: activeAlerts },
    { data: workerHeartbeatRaw },
    { data: workspaceCaps },
    { data: planRows },
  ] = await Promise.all([
    // Latest snapshot
    db.from("system_health_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 24h sparkline history (one row every 5 min = 288 max)
    db.from("system_health_snapshots")
      .select("captured_at, redis, server, queues, postal, db_stats")
      .gte("captured_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("captured_at", { ascending: true })
      .limit(300),

    // Active (unresolved) notifications
    db.from("notifications")
      .select("*")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50),

    // Worker heartbeat from notifications metadata (we read from DB since no direct Redis)
    db.from("system_health_snapshots")
      .select("captured_at")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Workspaces with inbox counts vs plan limits
    db.from("workspaces")
      .select("id, name, plan_id, inboxes(count)")
      .in("plan_status", ["active", "trialing"])
      .limit(200),

    // Plans for max_inboxes lookup
    db.from("plans")
      .select("id, max_inboxes"),
  ]);

  // Build plan map
  type PlanRow = { id: string; max_inboxes: number | null };
  const planMap = new Map<string, number>();
  for (const p of (planRows ?? []) as PlanRow[]) {
    if (p.max_inboxes != null) planMap.set(p.id, p.max_inboxes);
  }

  // Compute workspace cap utilisation
  type WorkspaceRow = { id: string; name: string; plan_id: string | null; inboxes: { count: number }[] };
  const capsNearLimit = ((workspaceCaps ?? []) as WorkspaceRow[])
    .map(w => {
      const current = Array.isArray(w.inboxes) ? (w.inboxes[0]?.count ?? 0) : 0;
      const max     = w.plan_id ? (planMap.get(w.plan_id) ?? null) : null;
      const pct     = max && max > 0 ? Math.round((current / max) * 100) : null;
      return { id: w.id, name: w.name, current, max, pct };
    })
    .filter(w => w.pct !== null && w.pct >= 70)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  // Worker status — if last snapshot is more than 10 min old, worker is considered down
  const lastCapture  = latestSnap?.captured_at ?? workerHeartbeatRaw?.captured_at ?? null;
  const workerAlive  = lastCapture
    ? Date.now() - new Date(lastCapture).getTime() < 10 * 60 * 1000
    : false;

  return NextResponse.json({
    snapshot:     latestSnap ?? null,
    history:      history ?? [],
    activeAlerts: activeAlerts ?? [],
    workerAlive,
    lastCapture,
    capsNearLimit,
  });
}
