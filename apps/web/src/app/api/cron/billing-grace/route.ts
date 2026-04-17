/**
 * GET /api/cron/billing-grace
 *
 * Runs daily. Finds workspaces whose 3-day payment grace period has expired
 * (plan_status = "past_due" and grace_ends_at <= now) and downgrades them
 * to the free plan.
 *
 * On downgrade:
 *   - Subscription credits expire (they don't roll over)
 *   - Purchased credits are preserved
 *   - All active campaigns are paused
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { downgradeWorkspaceToFree } from "@/lib/billing/downgrade";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const now = new Date().toISOString();

  // Find all workspaces past their grace period
  const { data: expired, error } = await db
    .from("workspaces")
    .select("id")
    .eq("plan_status", "past_due")
    .lte("grace_ends_at", now);

  if (error) {
    console.error("[billing-grace] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ ok: true, downgraded: 0 });
  }

  const results: { workspaceId: string; paused: number; creditsExpired: number }[] = [];

  for (const ws of expired) {
    try {
      const { paused, creditsExpired } = await downgradeWorkspaceToFree(db, ws.id, "grace_period_expired");
      results.push({ workspaceId: ws.id, paused, creditsExpired });
      console.warn(`[billing-grace] Downgraded workspace=${ws.id} paused=${paused} credits_expired=${creditsExpired}`);
    } catch (err) {
      console.error(`[billing-grace] Failed to downgrade workspace=${ws.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, downgraded: results.length, results });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
