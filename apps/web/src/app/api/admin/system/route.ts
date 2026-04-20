import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Queue } from "bullmq";
import IORedis from "ioredis";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

const QUEUE_NAMES = [
  "leadash:send",
  "leadash:reply-poll",
  "leadash:warmup",
  "leadash:webhook",
  "leadash:lead-campaign",
  "leadash:verify-bulk",
  "leadash:enrich-bulk",
] as const;

const QUEUE_LABELS: Record<string, string> = {
  "leadash:send":          "Send",
  "leadash:reply-poll":    "Reply Poll",
  "leadash:warmup":        "Warmup",
  "leadash:webhook":       "Webhook",
  "leadash:lead-campaign": "Lead Campaign",
  "leadash:verify-bulk":   "Verify Bulk",
  "leadash:enrich-bulk":   "Enrich Bulk",
};

function makeRedis() {
  return new IORedis(process.env.UPSTASH_REDIS_URL!, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    connectTimeout: 3000,
    tls: process.env.UPSTASH_REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  });
}

// GET /api/admin/system
// Optional query params: ?page=0&limit=25&queue=leadash:send
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page  = Math.max(0, parseInt(searchParams.get("page")  ?? "0"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25")));
  const filterQueue = searchParams.get("queue") ?? null;

  let redis: IORedis | null = null;
  let redisConnected = false;

  try {
    redis = makeRedis();
    await redis.ping();
    redisConnected = true;
  } catch {
    return NextResponse.json({
      redis: { connected: false },
      queues: [],
      failedJobs: [], failedTotal: 0,
      supabase: { connected: true },
      uptime: process.uptime(),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      workerHeartbeat: null,
    });
  }

  // Queue stats
  const queueStats = await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      try {
        const q = new Queue(name, { connection: redis! });
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          q.getWaitingCount(),
          q.getActiveCount(),
          q.getCompletedCount(),
          q.getFailedCount(),
          q.getDelayedCount(),
        ]);
        await q.close();
        return { name, label: QUEUE_LABELS[name] ?? name, waiting, active, completed, failed, delayed };
      } catch {
        return { name, label: QUEUE_LABELS[name] ?? name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, error: true };
      }
    })
  );

  // Failed jobs — paginated, optionally filtered by queue
  const queuesToScan = filterQueue
    ? QUEUE_NAMES.filter(n => n === filterQueue)
    : [...QUEUE_NAMES];

  // Collect all failed jobs across requested queues for pagination
  const allFailed: { queue: string; queueName: string; name: string; failedReason: string; timestamp: number }[] = [];
  for (const name of queuesToScan) {
    try {
      const q = new Queue(name, { connection: redis! });
      const total = await q.getFailedCount();
      // Fetch enough to support pagination across queues (max 500 per queue for performance)
      const jobs = await q.getFailed(0, Math.min(total, 500));
      for (const job of jobs) {
        allFailed.push({
          queue:        QUEUE_LABELS[name] ?? name,
          queueName:    name,
          name:         job.name,
          failedReason: job.failedReason ?? "Unknown error",
          timestamp:    job.timestamp,
        });
      }
      await q.close();
    } catch { /* skip */ }
  }

  allFailed.sort((a, b) => b.timestamp - a.timestamp);
  const failedTotal = allFailed.length;
  const failedJobs  = allFailed.slice(page * limit, (page + 1) * limit);

  // Worker heartbeat from Redis (worker writes "leadash:worker:heartbeat" key every 30s)
  let workerHeartbeat: { ts: number; pid?: number; hostname?: string } | null = null;
  try {
    const raw = await redis.get("leadash:worker:heartbeat");
    if (raw) workerHeartbeat = JSON.parse(raw) as { ts: number; pid?: number; hostname?: string };
  } catch { /* non-fatal */ }

  if (redis) {
    try { await redis.quit(); } catch { /* ignore */ }
  }

  // Supabase health check
  let supabaseConnected = true;
  try {
    const { error } = await ctx.adminClient.from("workspaces").select("id", { head: true, count: "exact" }).limit(1);
    if (error) supabaseConnected = false;
  } catch { supabaseConnected = false; }

  return NextResponse.json({
    redis:          { connected: redisConnected },
    queues:         queueStats,
    failedJobs,
    failedTotal,
    supabase:       { connected: supabaseConnected },
    uptime:         process.uptime(),
    nodeVersion:    process.version,
    memoryMb:       Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    workerHeartbeat,
  });
}

// POST /api/admin/system
// Body: { action: "clear_failed" | "retry_failed", queue: "leadash:send" | "all" }
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, queue } = await req.json() as { action: string; queue: string };
  if (!action || !queue) return NextResponse.json({ error: "action and queue required" }, { status: 400 });

  let redis: IORedis | null = null;
  try {
    redis = makeRedis();
    await redis.ping();
  } catch {
    return NextResponse.json({ error: "Redis unavailable" }, { status: 503 });
  }

  const targets = queue === "all" ? [...QUEUE_NAMES] : [queue as typeof QUEUE_NAMES[number]];
  let affected = 0;

  for (const name of targets) {
    if (!QUEUE_NAMES.includes(name as typeof QUEUE_NAMES[number])) continue;
    try {
      const q = new Queue(name, { connection: redis! });
      if (action === "clear_failed") {
        const count = await q.getFailedCount();
        await q.clean(0, count + 1, "failed");
        affected += count;
      } else if (action === "retry_failed") {
        const jobs = await q.getFailed(0, 1000);
        for (const job of jobs) {
          await job.retry().catch(() => {});
        }
        affected += jobs.length;
      }
      await q.close();
    } catch { /* skip */ }
  }

  if (redis) { try { await redis.quit(); } catch { /* ignore */ } }

  return NextResponse.json({ ok: true, affected });
}
