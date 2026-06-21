import "dotenv/config";
import os from "os";
import { Worker, QueueEvents } from "bullmq";
import { connection } from "./lib/redis";
import { processSend } from "./workers/send-worker";
import { processReplyPoll } from "./workers/reply-worker";
import { processWarmup } from "./workers/warmup-worker";
import { processWebhook } from "./workers/webhook-worker";
import { processLeadCampaign } from "./workers/lead-campaign-worker";
import { processVerifyBulk } from "./workers/verify-bulk-worker";
import { processEnrichBulk } from "./workers/enrich-bulk-worker";
import { processProvision } from "./workers/provision-worker";
import { processAiProspect } from "./workers/ai-prospect-worker";
import { startSchedulers } from "./schedulers";
import { startHttpServer } from "./server";

console.log("[Leadash Worker] Starting...");

// Prevent ImapFlow socket-timeout errors (emitted after logout) from crashing the process.
// These are expected transient network events, not application bugs.
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "ETIMEOUT" || (err as unknown as { _connId?: string })._connId) {
    console.warn("[worker] suppressed IMAP socket error:", err.message);
    return;
  }
  console.error("[worker] uncaughtException — restarting:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection:", reason);
});

function startHeartbeat() {
  const payload = JSON.stringify({ ts: Date.now(), pid: process.pid, hostname: os.hostname() });
  connection.set("leadash:worker:heartbeat", payload, "EX", 120).catch(() => {});
  setInterval(() => {
    const p = JSON.stringify({ ts: Date.now(), pid: process.pid, hostname: os.hostname() });
    connection.set("leadash:worker:heartbeat", p, "EX", 120).catch(() => {});
  }, 30_000);
}

// ── Workers ────────────────────────────────────────────────────────────────────

new Worker("leadash:send",           processSend,           { connection, concurrency: 50 });
new Worker("leadash:reply-poll",     processReplyPoll,      { connection, concurrency: 20 });
new Worker("leadash:warmup",         processWarmup,         { connection, concurrency: 10 });
new Worker("leadash:webhook",        processWebhook,        { connection, concurrency: 100 });
new Worker("leadash:lead-campaign",  processLeadCampaign,   { connection, concurrency: 2 });
new Worker("leadash:verify-bulk",    processVerifyBulk,     { connection, concurrency: 3 });
new Worker("leadash:enrich-bulk",    processEnrichBulk,     { connection, concurrency: 3 });
new Worker("leadash:provision",      processProvision,      { connection, concurrency: 3 });
new Worker("leadash:ai-prospect-enrich", processAiProspect, { connection, concurrency: 3 });

// ── Schedulers (internal crons) ───────────────────────────────────────────────
startSchedulers();

// ── HTTP server (domain check proxy, etc.) ────────────────────────────────────
startHttpServer();

// ── Heartbeat (admin system page checks this every 30s) ───────────────────────
startHeartbeat();

console.log("[Leadash Worker] All workers registered. Waiting for jobs...");

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Leadash Worker] SIGTERM received, shutting down...");
  process.exit(0);
});
