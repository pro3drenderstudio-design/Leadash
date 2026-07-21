/**
 * GET /api/billing/usage
 *
 * Returns the workspace's monthly send-cap usage. Live-counts outreach_sends
 * for the current UTC month with the SAME status filter the enforcer uses
 * (apps/web/src/lib/outreach/send-runner.ts) so the meter matches what
 * actually pauses campaigns at the cap. Warmup is excluded (separate table).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: ws } = await db
    .from("workspaces")
    .select("max_monthly_sends")
    .eq("id", workspaceId)
    .single();
  const cap = (ws?.max_monthly_sends as number | null) ?? -1;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count } = await db
    .from("outreach_sends")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .in("status", ["sent", "queued", "opened", "replied", "clicked"])
    .gte("created_at", monthStart.toISOString());

  const used = count ?? 0;
  const nextReset = new Date(monthStart);
  nextReset.setUTCMonth(nextReset.getUTCMonth() + 1);

  return NextResponse.json({
    sends_used: used,
    sends_cap:  cap,                                   // -1 = unlimited
    pct:        cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0,
    resets_at:  nextReset.toISOString(),
  });
}
