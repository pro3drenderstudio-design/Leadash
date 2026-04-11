// ─── Thin BullMQ queue client for use inside Next.js API routes ───────────────
// Only enqueues jobs — never processes them (that's the worker's job).

import { Queue } from "bullmq";
import IORedis from "ioredis";

let _connection: IORedis | null = null;

function getConnection(): IORedis | null {
  if (!process.env.UPSTASH_REDIS_URL) return null;
  if (!_connection) {
    _connection = new IORedis(process.env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      tls: process.env.UPSTASH_REDIS_URL.startsWith("rediss://") ? {} : undefined,
    });
  }
  return _connection;
}

export async function enqueueLeadCampaign(campaignId: string): Promise<void> {
  const conn = getConnection();
  if (!conn) return; // Worker not configured — fall back to cron
  const queue = new Queue("leadash:lead-campaign", { connection: conn });
  await queue.add("lead-campaign", { campaign_id: campaignId }, {
    jobId:    `lead-campaign:${campaignId}`,
    attempts: 3,
    backoff:  { type: "exponential", delay: 5_000 },
  });
}
