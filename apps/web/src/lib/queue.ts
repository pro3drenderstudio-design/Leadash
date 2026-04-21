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

function makeQueue(name: string) {
  const conn = getConnection();
  if (!conn) return null;
  return new Queue(name, { connection: conn });
}

export async function enqueueLeadCampaign(campaignId: string): Promise<void> {
  const queue = makeQueue("leadash:lead-campaign");
  if (!queue) return;
  await queue.add("lead-campaign", { campaign_id: campaignId }, {
    jobId:    `lead-campaign:${campaignId}`,
    attempts: 3,
    backoff:  { type: "exponential", delay: 5_000 },
  });
}

export async function enqueueVerifyBulk(jobId: string, workspaceId: string): Promise<void> {
  const queue = makeQueue("leadash:verify-bulk");
  if (!queue) throw new Error("Redis not configured — cannot process bulk verification");
  await queue.add("verify-bulk", { job_id: jobId, workspace_id: workspaceId }, {
    jobId:    `verify-bulk:${jobId}`,
    attempts: 2,
    backoff:  { type: "fixed", delay: 10_000 },
  });
}

export async function enqueueEnrichBulk(jobId: string, workspaceId: string): Promise<void> {
  const queue = makeQueue("leadash:enrich-bulk");
  if (!queue) throw new Error("Redis not configured — cannot process bulk enrichment");
  await queue.add("enrich-bulk", { job_id: jobId, workspace_id: workspaceId }, {
    jobId:    `enrich-bulk:${jobId}`,
    attempts: 2,
    backoff:  { type: "fixed", delay: 10_000 },
  });
}

export async function enqueueProvision(domainRecordId: string, workspaceId: string): Promise<void> {
  const queue = makeQueue("leadash:provision");
  if (!queue) throw new Error("Redis not configured — cannot enqueue provision job");
  await queue.add("provision", { domain_record_id: domainRecordId, workspace_id: workspaceId }, {
    jobId:    `provision:${domainRecordId}:${Date.now()}`,
    attempts: 2,
    backoff:  { type: "fixed", delay: 30_000 },
  });
}
