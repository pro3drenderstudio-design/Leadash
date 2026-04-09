import { Queue } from "bullmq";
import IORedis from "ioredis";

let _connection: IORedis | null = null;

function getConnection() {
  if (!_connection) {
    _connection = new IORedis(process.env.UPSTASH_REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck:     false,
      tls: process.env.UPSTASH_REDIS_URL?.startsWith("rediss://") ? {} : undefined,
    });
  }
  return _connection;
}

export const sendQueue    = () => new Queue("leadash:send",       { connection: getConnection() });
export const replyQueue   = () => new Queue("leadash:reply-poll", { connection: getConnection() });
export const warmupQueue  = () => new Queue("leadash:warmup",     { connection: getConnection() });
export const webhookQueue = () => new Queue("leadash:webhook",    { connection: getConnection() });

/** Enqueue a one-off send batch for a workspace (e.g. after campaign activation) */
export async function enqueueSend(workspaceId: string, batchLimit = 100) {
  const q = sendQueue();
  await q.add("send", { workspace_id: workspaceId, batch_limit: batchLimit }, {
    attempts: 2,
    backoff:  { type: "fixed", delay: 30_000 },
  });
}

/** Enqueue a webhook delivery */
export async function enqueueWebhook(data: {
  workspace_id:   string;
  endpoint_url:   string;
  signing_secret: string;
  event_type:     string;
  payload:        Record<string, unknown>;
}) {
  const q = webhookQueue();
  await q.add("webhook", data, { attempts: 3, backoff: { type: "exponential", delay: 5_000 } });
}
