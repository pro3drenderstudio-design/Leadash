/**
 * GET /api/mobile/dashboard
 *
 * Pre-aggregated dashboard payload for the mobile app's Home screen.
 * Same stats as the web dashboard (lib/outreach/dashboard-stats) plus the
 * "needs attention" lists the mobile Home surfaces: inboxes in error and
 * paused campaigns.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { getStats } from "@/lib/outreach/dashboard-stats";

export async function GET(req: NextRequest) {
  const ctx = await requireWorkspace(req);
  if (!ctx.ok) return ctx.res;
  const { workspaceId, db } = ctx;

  const [stats, errorInboxes, pausedCampaigns] = await Promise.all([
    getStats(workspaceId),
    db.from("outreach_inboxes")
      .select("id, email_address, last_error")
      .eq("workspace_id", workspaceId)
      .eq("status", "error"),
    db.from("outreach_campaigns")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .eq("status", "paused"),
  ]);

  return NextResponse.json({
    ...stats,
    errorInboxes:    errorInboxes.data ?? [],
    pausedCampaigns: pausedCampaigns.data ?? [],
  });
}
