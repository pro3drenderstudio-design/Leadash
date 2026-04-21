/**
 * Daily deliverability health checks.
 * - Campaigns: warn at 3% bounce rate, auto-pause at 5% (rolling 7 days)
 * - Inboxes: warn at 3%, force rehabilitation at 5% (rolling 7 days)
 * - Rehab: 14 days for 5-10% bounce rate, 21 days for >10%
 */

import { createClient } from "@supabase/supabase-js";

const CAMPAIGN_WARN_THRESHOLD  = 0.03;
const CAMPAIGN_PAUSE_THRESHOLD = 0.05;
const INBOX_WARN_THRESHOLD     = 0.03;
const INBOX_REHAB_THRESHOLD    = 0.05;
const MIN_SAMPLE_CAMPAIGN      = 20;
const MIN_SAMPLE_INBOX         = 10;
const REHAB_DAYS_MILD          = 14;
const REHAB_DAYS_SEVERE        = 21;

function supabase() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL)!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface DeliverabilityResult {
  campaigns_warned:  number;
  campaigns_paused:  number;
  inboxes_warned:    number;
  inboxes_rehabbed:  number;
  inboxes_recovered: number;
}

export async function runDeliverabilityChecks(): Promise<DeliverabilityResult> {
  const db     = supabase();
  const result: DeliverabilityResult = {
    campaigns_warned:  0,
    campaigns_paused:  0,
    inboxes_warned:    0,
    inboxes_rehabbed:  0,
    inboxes_recovered: 0,
  };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now          = new Date().toISOString();

  // ── 1. Auto-recover inboxes whose rehab period ended ───────────────────────
  const { data: recoveredRows } = await db
    .from("outreach_inboxes")
    .update({ bounce_rehab_ends_at: null, updated_at: now })
    .lt("bounce_rehab_ends_at", now)
    .not("bounce_rehab_ends_at", "is", null)
    .select("id");

  result.inboxes_recovered = recoveredRows?.length ?? 0;

  // ── 2. Campaign bounce rate check ──────────────────────────────────────────
  const { data: activeCampaigns } = await db
    .from("outreach_campaigns")
    .select("id")
    .eq("status", "active");

  for (const campaign of activeCampaigns ?? []) {
    const [{ count: sent }, { count: bounced }] = await Promise.all([
      db.from("outreach_sends")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .in("status", ["sent", "opened", "replied", "clicked"])
        .gte("created_at", sevenDaysAgo),
      db.from("outreach_sends")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("status", "bounced")
        .gte("created_at", sevenDaysAgo),
    ]);

    const total   = (sent ?? 0) + (bounced ?? 0);
    if (total < MIN_SAMPLE_CAMPAIGN) continue;

    const rate    = (bounced ?? 0) / total;
    const ratePct = (rate * 100).toFixed(1);

    if (rate >= CAMPAIGN_PAUSE_THRESHOLD) {
      await db.from("outreach_campaigns").update({
        status:       "paused",
        pause_reason: `Auto-paused: ${ratePct}% bounce rate over the last 7 days (threshold: ${CAMPAIGN_PAUSE_THRESHOLD * 100}%)`,
        updated_at:   now,
      }).eq("id", campaign.id);
      result.campaigns_paused++;
      console.warn(`[deliverability] Campaign ${campaign.id} paused — ${ratePct}% bounce rate`);
    } else if (rate >= CAMPAIGN_WARN_THRESHOLD) {
      await db.from("outreach_campaigns").update({
        pause_reason: `Warning: ${ratePct}% bounce rate over the last 7 days`,
        updated_at:   now,
      }).eq("id", campaign.id);
      result.campaigns_warned++;
    } else {
      // Clear any stale warning if rate is now healthy
      await db.from("outreach_campaigns").update({
        pause_reason: null,
        updated_at:   now,
      }).eq("id", campaign.id).not("pause_reason", "is", null);
    }
  }

  // ── 3. Inbox bounce rate check ─────────────────────────────────────────────
  // Only check inboxes not currently in rehab
  const { data: activeInboxes } = await db
    .from("outreach_inboxes")
    .select("id")
    .eq("status", "active")
    .or(`bounce_rehab_ends_at.is.null,bounce_rehab_ends_at.lt.${now}`);

  for (const inbox of activeInboxes ?? []) {
    const [{ count: sent }, { count: bounced }] = await Promise.all([
      db.from("outreach_sends")
        .select("id", { count: "exact", head: true })
        .eq("inbox_id", inbox.id)
        .in("status", ["sent", "opened", "replied", "clicked"])
        .gte("created_at", sevenDaysAgo),
      db.from("outreach_sends")
        .select("id", { count: "exact", head: true })
        .eq("inbox_id", inbox.id)
        .eq("status", "bounced")
        .gte("created_at", sevenDaysAgo),
    ]);

    const total = (sent ?? 0) + (bounced ?? 0);
    if (total < MIN_SAMPLE_INBOX) continue;

    const rate    = (bounced ?? 0) / total;
    const ratePct = (rate * 100).toFixed(1);

    if (rate >= INBOX_REHAB_THRESHOLD) {
      const rehabDays = rate > 0.10 ? REHAB_DAYS_SEVERE : REHAB_DAYS_MILD;
      const rehabEndsAt = new Date(Date.now() + rehabDays * 24 * 60 * 60 * 1000).toISOString();

      await db.from("outreach_inboxes").update({
        bounce_rehab_ends_at: rehabEndsAt,
        warmup_enabled:       true,
        warmup_current_daily: 1,
        daily_send_limit:     1,
        updated_at:           now,
      }).eq("id", inbox.id);

      result.inboxes_rehabbed++;
      console.warn(`[deliverability] Inbox ${inbox.id} → rehab ${rehabDays}d — ${ratePct}% bounce rate`);
    } else if (rate >= INBOX_WARN_THRESHOLD) {
      result.inboxes_warned++;
    }
  }

  return result;
}
