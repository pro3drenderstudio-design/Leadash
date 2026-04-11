import cron from "node-cron";
import { Queue } from "bullmq";
import { connection } from "../lib/redis";
import { adminClient } from "../lib/supabase";

const sendQueue           = new Queue("leadash:send",           { connection });
const replyQueue          = new Queue("leadash:reply-poll",     { connection });
const warmupQueue         = new Queue("leadash:warmup",         { connection });
const leadCampaignQueue   = new Queue("leadash:lead-campaign",  { connection });

async function getActiveWorkspaceIds(): Promise<string[]> {
  const db = adminClient();
  const { data } = await db
    .from("workspaces")
    .select("id")
    .in("plan_status", ["active", "trialing"])
    .lt("sends_this_month", db.raw("max_monthly_sends") as unknown as number);
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

  // ── Monthly send counter reset: 1st of each month at 00:05 UTC ───────────
  cron.schedule("5 0 1 * *", async () => {
    const db = adminClient();
    await db.from("workspaces").update({
      sends_this_month: 0,
      sends_month_reset: new Date().toISOString().slice(0, 10),
    }).lt("sends_this_month", 999_999_999);
    console.log("[scheduler:reset] Monthly send counters reset");
  });

  console.log("[schedulers] All schedulers started");
}
