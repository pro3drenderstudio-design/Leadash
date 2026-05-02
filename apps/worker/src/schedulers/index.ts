import cron from "node-cron";
import { Queue } from "bullmq";
import { connection } from "../lib/redis";
import { adminClient } from "../lib/supabase";

const APP_URL     = process.env.APP_URL     ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const sendQueue           = new Queue("leadash:send",           { connection });
const replyQueue          = new Queue("leadash:reply-poll",     { connection });
const warmupQueue         = new Queue("leadash:warmup",         { connection });
const leadCampaignQueue   = new Queue("leadash:lead-campaign",  { connection });

async function getActiveWorkspaceIds(): Promise<string[]> {
  const db = adminClient();
  const { data } = await db
    .from("workspaces")
    .select("id")
    .in("plan_status", ["active", "trialing"]);
  return (data ?? []).map((r: { id: string }) => r.id);
}

export function startSchedulers() {
  // ── Send: every 5 minutes ────────────────────────────────────────────────
  cron.schedule("*/5 * * * *", async () => {
    const workspaceIds = await getActiveWorkspaceIds();
    for (const workspace_id of workspaceIds) {
      await sendQueue.add("send", { workspace_id, batch_limit: 100 }, {
        jobId:   `send:${workspace_id}:${Date.now()}`,
        attempts: 2,
        backoff:  { type: "fixed", delay: 30_000 },
      });
    }
    console.log(`[scheduler:send] Enqueued ${workspaceIds.length} workspaces`);
  });

  // ── Reply poll: every 15 minutes ─────────────────────────────────────────
  cron.schedule("*/15 * * * *", async () => {
    const workspaceIds = await getActiveWorkspaceIds();
    for (const workspace_id of workspaceIds) {
      await replyQueue.add("reply-poll", { workspace_id }, {
        jobId:   `reply:${workspace_id}:${Date.now()}`,
        attempts: 2,
      });
    }
    console.log(`[scheduler:reply] Enqueued ${workspaceIds.length} workspaces`);
  });

  // ── Warmup: every 4 hours ────────────────────────────────────────────────
  cron.schedule("0 */4 * * *", async () => {
    const workspaceIds = await getActiveWorkspaceIds();
    for (const workspace_id of workspaceIds) {
      await warmupQueue.add("warmup", { workspace_id }, {
        jobId:   `warmup:${workspace_id}:${Date.now()}`,
        attempts: 1,
      });
    }
    console.log(`[scheduler:warmup] Enqueued ${workspaceIds.length} workspaces`);
  });

  // ── Lead campaigns: every 2 minutes ─────────────────────────────────────
  cron.schedule("*/2 * * * *", async () => {
    const db = adminClient();
    const { data: campaigns } = await db
      .from("lead_campaigns")
      .select("id")
      .in("status", ["pending", "running"])
      .order("created_at")
      .limit(20);

    for (const c of campaigns ?? []) {
      await leadCampaignQueue.add("lead-campaign", { campaign_id: c.id }, {
        jobId:    `lead-campaign:${c.id}`,   // deduplicates — won't double-process same campaign
        attempts: 2,
        backoff:  { type: "fixed", delay: 10_000 },
      });
    }
    if ((campaigns ?? []).length > 0) {
      console.log(`[scheduler:lead-campaigns] Enqueued ${campaigns!.length} campaigns`);
    }
  });

  // ── Warmup ramp: daily at 00:00 UTC (+1/day per inbox until target) ─────────
  cron.schedule("0 0 * * *", async () => {
    const { runWarmupRamp } = await import("../../../web/src/lib/outreach/warmup-runner");
    const workspaceIds = await getActiveWorkspaceIds();
    let ramped = 0;
    for (const workspace_id of workspaceIds) {
      try { await runWarmupRamp(workspace_id); ramped++; } catch { /* non-fatal */ }
    }
    console.log(`[scheduler:warmup-ramp] ramped ${ramped} workspaces`);
  });

  // ── Deliverability checks: daily at 06:00 UTC ───────────────────────────
  cron.schedule("0 6 * * *", async () => {
    const { runDeliverabilityChecks } = await import("../../../web/src/lib/outreach/deliverability");
    try {
      const result = await runDeliverabilityChecks();
      console.log("[scheduler:deliverability]", result);
    } catch (e) {
      console.error("[scheduler:deliverability] failed:", e);
    }
  });

  // ── Monthly send counter reset: 1st of each month at 00:05 UTC ───────────
  cron.schedule("5 0 1 * *", async () => {
    const db = adminClient();
    await db.from("workspaces").update({
      sends_this_month: 0,
      sends_month_reset: new Date().toISOString().slice(0, 10),
    }).lt("sends_this_month", 999_999_999);
    console.log("[scheduler:reset] Monthly send counters reset");
  });

  // ── Inbox billing: daily at 02:00 UTC ────────────────────────────────────
  // Delegates to the Vercel API route — Paystack charging + email notifications
  // are kept in one place.
  cron.schedule("0 2 * * *", async () => {
    if (!APP_URL || !CRON_SECRET) {
      console.warn("[scheduler:inbox-billing] APP_URL or CRON_SECRET not set — skipping");
      return;
    }
    try {
      const res = await fetch(`${APP_URL}/api/cron/inbox-billing`, {
        method: "POST",
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[scheduler:inbox-billing] HTTP ${res.status}: ${text.slice(0, 200)}`);
        return;
      }
      const data = await res.json() as { charged?: number };
      console.log(`[scheduler:inbox-billing] charged=${data?.charged ?? 0}`);
    } catch (e) {
      console.error("[scheduler:inbox-billing] failed:", e);
    }
  });

  // ── Infrastructure health snapshot: every 5 minutes ────────────────────
  cron.schedule("*/5 * * * *", async () => {
    try {
      const { runHealthSnapshot } = await import("./health-snapshot");
      await runHealthSnapshot();
    } catch (e) {
      console.error("[scheduler:health] snapshot failed:", e);
    }
  });

  // ── Data cleanup: every Sunday at 03:00 UTC ──────────────────────────────
  // Deletes lead campaign records older than 60 days.
  cron.schedule("0 3 * * 0", async () => {
    const db      = adminClient();
    const cutoff  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const results: Record<string, number> = {};

    const tables: Array<{ table: string; extra?: Record<string, string[]> }> = [
      { table: "lead_campaign_leads" },
      { table: "lead_campaigns", extra: { status: ["done", "failed", "cancelled"] } },
    ];

    for (const { table, extra } of tables) {
      let q = db.from(table).delete({ count: "exact" }).lt("created_at", cutoff);
      if (extra?.status) q = (q as typeof q).in("status", extra.status);
      const { count, error } = await q;
      if (!error) results[table] = count ?? 0;
      else console.error(`[scheduler:cleanup] ${table}:`, error.message);
    }

    console.log("[scheduler:cleanup] done:", results);
  });

  console.log("[schedulers] All schedulers started");
}
