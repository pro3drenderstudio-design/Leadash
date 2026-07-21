/**
 * GET /api/billing/usage
 *
 * Returns the workspace's monthly send-cap usage. The cap is sending CAPACITY
 * derived from inboxes at 500 sends/inbox/month (each connected inbox adds 500),
 * not the plan's raw max_monthly_sends. Live-counts outreach_sends for the
 * current UTC month with the SAME status filter the send-runner uses. Warmup is
 * excluded (separate table).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

const SENDS_PER_INBOX_PER_MONTH = 500;

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  // Sending capacity = 500 × active inboxes. Only 'active' inboxes can send
  // ('error'/'provisioning' inboxes add no capacity).
  const { count: inboxCount } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  const cap = (inboxCount ?? 0) * SENDS_PER_INBOX_PER_MONTH;

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
