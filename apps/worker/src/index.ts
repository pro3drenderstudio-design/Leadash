import "dotenv/config";
import { Worker, QueueEvents } from "bullmq";
import { connection } from "./lib/redis";
import { processSend } from "./workers/send-worker";
import { processReplyPoll } from "./workers/reply-worker";
import { processWarmup } from "./workers/warmup-worker";
import { processWebhook } from "./workers/webhook-worker";
import { processLeadCampaign } from "./workers/lead-campaign-worker";
import { processVerifyBulk } from "./workers/verify-bulk-worker";
import { processEnrichBulk } from "./workers/enrich-bulk-worker";
import { startSchedulers } from "./schedulers";

console.log("[Leadash Worker] Starting...");

// ── Workers ────────────────────────────────────────────────────────────────────

new Worker("leadash:send",           processSend,           { connection, concurrency: 50 });
new Worker("leadash:reply-poll",     processReplyPoll,      { connection, concurrency: 20 });
new Worker("leadash:warmup",         processWarmup,         { connection, concurrency: 10 });
new Worker("leadash:webhook",        processWebhook,        { connection, concurrency: 100 });
new Worker("leadash:lead-campaign",  processLeadCampaign,   { connection, concurrency: 2 });
new Worker("leadash:verify-bulk",    processVerifyBulk,     { connection, concurrency: 3 });
new Worker("leadash:enrich-bulk",    processEnrichBulk,     { connection, concurrency: 3 });

// ── Schedulers (internal crons) ───────────────────────────────────────────────
startSchedulers();

console.log("[Leadash Worker] All workers registered. Waiting for jobs...");

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Leadash Worker] SIGTERM received, shutting down...");
  process.exit(0);
});
