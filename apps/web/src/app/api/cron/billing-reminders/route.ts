/**
 * GET /api/cron/billing-reminders
 *
 * Runs daily. Sends lifecycle billing emails:
 *
 * Trial / beta expiry (uses trial_ends_at):
 *   - 3 days before → "expires in 3 days"
 *   - 2 days before → "expires in 2 days"
 *   - 1 day  before → "expires tomorrow"
 *   - On expiry day → "has expired"
 *
 * Subscription renewal (uses subscription_renews_at):
 *   - 3 days before → "renews in 3 days"
 *   - 1 day  before → "renews tomorrow"
 *
 * Grace period warning (uses grace_ends_at):
 *   - When plan_status = "past_due" → one-time warning email
 *
 * Downgrade confirmation (fires in billing-grace cron, imported here too via
 * the downgrade helper — only if the workspace has no downgrade_notified_at).
 *
 * Idempotency: each reminder type is keyed by type + calendar date in the
 * billing_reminders_sent JSONB column.  A reminder is sent at most once per day.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  sendTrialExpiryReminder,
  sendTrialExpiredEmail,
  sendSubscriptionRenewalReminder,
  sendGracePeriodWarning,
  sendInboxRenewalReminder,
} from "@/lib/email/notifications";

export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function daysFromNow(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = createAdminClient();
  const now = new Date().toISOString();
  const t   = today();

  let sent = 0;
  let skipped = 0;

  // ── 1. Trial / beta expiry reminders ──────────────────────────────────────
  // Fetch workspaces with trial_ends_at within the next 4 days or in the past 2 days
  const trialWindowStart = new Date(Date.now() - 2  * 24 * 60 * 60 * 1000).toISOString();
  const trialWindowEnd   = new Date(Date.now() + 4  * 24 * 60 * 60 * 1000).toISOString();

  const { data: trialWorkspaces } = await db
    .from("workspaces")
    .select("id, name, billing_email, plan_id, trial_ends_at, billing_reminders_sent")
    .not("trial_ends_at", "is", null)
    .gte("trial_ends_at", trialWindowStart)
    .lte("trial_ends_at", trialWindowEnd);

  for (const ws of trialWorkspaces ?? []) {
    if (!ws.billing_email) continue;

    const sent_map = (ws.billing_reminders_sent ?? {}) as Record<string, boolean>;
    const daysLeft = daysFromNow(ws.trial_ends_at!);
    const isBeta   = ws.plan_id !== "free";

    const remindersToCheck: Array<{ key: string; daysLeft: number; expired: boolean }> = [
      { key: `trial_3d_${t}`, daysLeft: 3, expired: false },
      { key: `trial_2d_${t}`, daysLeft: 2, expired: false },
      { key: `trial_1d_${t}`, daysLeft: 1, expired: false },
      { key: `trial_exp_${t}`, daysLeft: 0, expired: true },
    ];

    for (const r of remindersToCheck) {
      if (sent_map[r.key]) { skipped++; continue; }
      if (r.expired ? daysLeft > 0 : daysLeft !== r.daysLeft) continue;

      try {
        if (r.expired) {
          await sendTrialExpiredEmail({ userEmail: ws.billing_email, workspaceName: ws.name, isBeta });
        } else {
          await sendTrialExpiryReminder({
            userEmail: ws.billing_email,
            workspaceName: ws.name,
            daysLeft: r.daysLeft,
            trialEndsAt: ws.trial_ends_at!,
            isBeta,
          });
        }
        await db.from("workspaces")
          .update({ billing_reminders_sent: { ...sent_map, [r.key]: true } })
          .eq("id", ws.id);
        sent++;
      } catch (err) {
        console.error(`[billing-reminders] trial email failed ws=${ws.id} key=${r.key}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── 2. Subscription renewal reminders ─────────────────────────────────────
  const renewWindowEnd = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

  const { data: renewWorkspaces } = await db
    .from("workspaces")
    .select("id, name, billing_email, plan_id, subscription_renews_at, billing_reminders_sent")
    .not("subscription_renews_at", "is", null)
    .gt("subscription_renews_at", now)
    .lte("subscription_renews_at", renewWindowEnd)
    .eq("plan_status", "active");

  for (const ws of renewWorkspaces ?? []) {
    if (!ws.billing_email || !ws.subscription_renews_at) continue;

    const sent_map = (ws.billing_reminders_sent ?? {}) as Record<string, boolean>;
    const daysLeft = daysFromNow(ws.subscription_renews_at);

    const remindersToCheck = [
      { key: `renew_3d_${t}`, daysLeft: 3 },
      { key: `renew_1d_${t}`, daysLeft: 1 },
    ];

    for (const r of remindersToCheck) {
      if (sent_map[r.key]) { skipped++; continue; }
      if (daysLeft !== r.daysLeft) continue;

      try {
        await sendSubscriptionRenewalReminder({
          userEmail:     ws.billing_email,
          workspaceName: ws.name,
          planName:      ws.plan_id,
          daysLeft:      r.daysLeft,
          renewsAt:      ws.subscription_renews_at,
        });
        await db.from("workspaces")
          .update({ billing_reminders_sent: { ...sent_map, [r.key]: true } })
          .eq("id", ws.id);
        sent++;
      } catch (err) {
        console.error(`[billing-reminders] renewal email failed ws=${ws.id} key=${r.key}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── 3. Grace period warning ────────────────────────────────────────────────
  const { data: graceWorkspaces } = await db
    .from("workspaces")
    .select("id, name, billing_email, grace_ends_at, billing_reminders_sent")
    .eq("plan_status", "past_due")
    .not("grace_ends_at", "is", null);

  for (const ws of graceWorkspaces ?? []) {
    if (!ws.billing_email || !ws.grace_ends_at) continue;

    const sent_map = (ws.billing_reminders_sent ?? {}) as Record<string, boolean>;
    const key = `grace_warn_${t}`;
    if (sent_map[key]) { skipped++; continue; }

    try {
      await sendGracePeriodWarning({
        userEmail:     ws.billing_email,
        workspaceName: ws.name,
        graceEndsAt:   ws.grace_ends_at,
      });
      await db.from("workspaces")
        .update({ billing_reminders_sent: { ...sent_map, [key]: true } })
        .eq("id", ws.id);
      sent++;
    } catch (err) {
      console.error(`[billing-reminders] grace email failed ws=${ws.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // ── 4. Inbox domain renewal reminders ─────────────────────────────────────
  const inboxWindowEnd = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();

  const { data: inboxDomains } = await db
    .from("outreach_domains")
    .select("id, domain, paystack_billing_email, paystack_inbox_monthly_kobo, inbox_next_billing_date, billing_reminders_sent")
    .eq("status", "active")
    .eq("payment_provider", "paystack")
    .not("inbox_next_billing_date", "is", null)
    .not("paystack_billing_email", "is", null)
    .gt("inbox_next_billing_date", now)
    .lte("inbox_next_billing_date", inboxWindowEnd);

  for (const d of inboxDomains ?? []) {
    if (!d.paystack_billing_email || !d.inbox_next_billing_date) continue;

    const sent_map = (d.billing_reminders_sent ?? {}) as Record<string, boolean>;
    const daysLeft = daysFromNow(d.inbox_next_billing_date);
    const amountNgn = Math.round(((d.paystack_inbox_monthly_kobo as number | null) ?? 0) / 100);

    const remindersToCheck = [
      { key: `inbox_3d_${t}`, daysLeft: 3 },
      { key: `inbox_1d_${t}`, daysLeft: 1 },
    ];

    for (const r of remindersToCheck) {
      if (sent_map[r.key]) { skipped++; continue; }
      if (daysLeft !== r.daysLeft) continue;

      try {
        await sendInboxRenewalReminder({
          userEmail:  d.paystack_billing_email,
          domain:     d.domain,
          amountNgn,
          renewsAt:   d.inbox_next_billing_date,
          daysLeft:   r.daysLeft,
        });
        await db.from("outreach_domains")
          .update({ billing_reminders_sent: { ...sent_map, [r.key]: true } })
          .eq("id", d.id);
        sent++;
      } catch (err) {
        console.error(`[billing-reminders] inbox email failed domain=${d.domain} key=${r.key}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, skipped });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
