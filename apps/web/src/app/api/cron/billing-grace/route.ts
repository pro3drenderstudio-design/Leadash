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
import { sendDowngradeNotification, sendBundleExpiredEmail } from "@/lib/email/notifications";
import { enqueueAutomation } from "@/lib/queue/client";

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
      // Re-check plan_status — workspace may have recovered via payment during this run
      const { data: current } = await db.from("workspaces")
        .select("plan_status")
        .eq("id", ws.id)
        .single();
      if (current?.plan_status !== "past_due") {
        console.warn(`[billing-grace] Skipping workspace=${ws.id} — status is now ${current?.plan_status}`);
        continue;
      }

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

  // ── 2. Bundle grace period expired — revoke bundle access ──────────────────
  const { data: expiredBundleGrace, error: bundleGraceErr } = await db
    .from("workspaces")
    .select("id, name, billing_email, bundle_paystack_sub_code, workspace_members(user_id)")
    .not("bundle_grace_ends_at", "is", null)
    .lte("bundle_grace_ends_at", now);

  if (!bundleGraceErr) {
    for (const ws of expiredBundleGrace ?? []) {
      try {
        const wsTyped = ws as Record<string, unknown>;
        // Revoke bundle access: clear bundle_expires_at, bundle_grace_ends_at
        await db.from("workspaces")
          .update({
            bundle_expires_at:      null,
            bundle_grace_ends_at:   null,
            bundle_paystack_sub_code: null,
            updated_at:             new Date().toISOString(),
          })
          .eq("id", ws.id);

        // Revoke workspace entitlements sourced from bundle
        await db.from("workspace_entitlements")
          .delete()
          .eq("workspace_id", ws.id)
          .eq("source", "bundle_subscription");

        // Fire automation event
        const members = wsTyped.workspace_members as Array<{ user_id: string }> | null;
        const userId  = members?.[0]?.user_id;
        if (userId) {
          enqueueAutomation({
            workspace_id: ws.id,
            user_id:      userId,
            event:        "user.bundle_expired",
            payload:      { reason: "grace_period_expired" },
          }).catch(e => console.error(`[billing-grace] bundle automation failed ws=${ws.id}:`, e instanceof Error ? e.message : e));
        }

        // Notify user
        const emailTo = await resolveEmail(db, ws.billing_email, members);
        if (emailTo) {
          sendBundleExpiredEmail({ userEmail: emailTo })
            .catch(e => console.error(`[billing-grace] bundle expired email failed ws=${ws.id}:`, e instanceof Error ? e.message : e));
        }

        console.warn(`[billing-grace] Bundle access revoked (grace expired): workspace=${ws.id}`);
      } catch (err) {
        console.error(`[billing-grace] Failed to revoke bundle for workspace=${ws.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── 3. Bundle expired with no grace period (direct expiry, Paystack annual) ─
  // For annual subs where Paystack successfully retried and renewed, invoice.update
  // would have extended bundle_expires_at. If bundle_expires_at < now and
  // bundle_grace_ends_at is null, the subscription simply lapsed.
  const { data: directExpired } = await db
    .from("workspaces")
    .select("id, name, billing_email, bundle_paystack_sub_code, workspace_members(user_id)")
    .not("bundle_expires_at", "is", null)
    .lte("bundle_expires_at", now)
    .is("bundle_grace_ends_at", null);

  for (const ws of directExpired ?? []) {
    try {
      const wsTyped = ws as Record<string, unknown>;
      await db.from("workspaces")
        .update({
          bundle_expires_at:       null,
          bundle_paystack_sub_code: null,
          updated_at:              new Date().toISOString(),
        })
        .eq("id", ws.id);

      await db.from("workspace_entitlements")
        .delete()
        .eq("workspace_id", ws.id)
        .eq("source", "bundle_subscription");

      const members = wsTyped.workspace_members as Array<{ user_id: string }> | null;
      const userId  = members?.[0]?.user_id;
      if (userId) {
        enqueueAutomation({
          workspace_id: ws.id,
          user_id:      userId,
          event:        "user.bundle_expired",
          payload:      { reason: "natural_expiry" },
        }).catch(() => {});
      }

      const emailTo = await resolveEmail(db, ws.billing_email, members);
      if (emailTo) {
        sendBundleExpiredEmail({ userEmail: emailTo }).catch(() => {});
      }
      console.warn(`[billing-grace] Bundle natural expiry: workspace=${ws.id}`);
    } catch (err) {
      console.error(`[billing-grace] Bundle natural expiry cleanup failed ws=${ws.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true, downgraded: results.length, results });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
