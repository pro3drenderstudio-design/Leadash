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
import { sendDowngradeNotification } from "@/lib/email/notifications";

export const maxDuration = 60;

async function resolveEmail(
  db: ReturnType<typeof createAdminClient>,
  billingEmail: string | null,
  members: Array<{ user_id: string }> | null,
): Promise<string | null> {
  if (billingEmail) return billingEmail;
  const userId = members?.[0]?.user_id;
  if (!userId) return null;
  try {
    const { data: { user } } = await db.auth.admin.getUserById(userId);
    return user?.email ?? null;
  } catch { return null; }
}

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
    .select("id, name, billing_email, workspace_members(user_id)")
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
      const emailTo = await resolveEmail(db, ws.billing_email, (ws as Record<string, unknown>).workspace_members as Array<{ user_id: string }> | null);
      if (emailTo) {
        sendDowngradeNotification({
          userEmail:     emailTo,
          workspaceName: ws.name,
          reason:        "grace_period_expired",
        }).catch(e => console.error(`[billing-grace] downgrade email failed ws=${ws.id}:`, e instanceof Error ? e.message : e));
      }
    } catch (err) {
      console.error(`[billing-grace] Failed to downgrade workspace=${ws.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, downgraded: results.length, results });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
