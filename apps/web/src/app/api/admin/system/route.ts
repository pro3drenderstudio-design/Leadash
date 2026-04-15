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

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let redis: IORedis | null = null;
  let redisConnected = false;

  try {
    redis = new IORedis(process.env.UPSTASH_REDIS_URL!, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 3000,
      tls: process.env.UPSTASH_REDIS_URL?.startsWith("rediss://") ? {} : undefined,
    });
    await redis.ping();
    redisConnected = true;
  } catch {
    // Redis unavailable — return degraded response
    return NextResponse.json({
      redis: { connected: false },
      queues: [],
      failedJobs: [],
      supabase: { connected: true },
      uptime: process.uptime(),
      nodeVersion: process.version,
      memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  }

  // Queue stats
  const queueStats = await Promise.all(
    QUEUE_NAMES.map(async (name) => {
      try {
        const q = new Queue(name, {
          connection: redis!,
        });
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

  // Recent failed jobs (sample from each queue)
  const failedJobs: { queue: string; name: string; failedReason: string; timestamp: number }[] = [];
  for (const name of QUEUE_NAMES) {
    try {
      const q = new Queue(name, { connection: redis! });
      const jobs = await q.getFailed(0, 4);
      for (const job of jobs) {
        failedJobs.push({
          queue:        QUEUE_LABELS[name] ?? name,
          name:         job.name,
          failedReason: job.failedReason ?? "Unknown error",
          timestamp:    job.timestamp,
        });
      }
      await q.close();
    } catch { /* skip */ }
  }

  // Sort failed jobs by recency
  failedJobs.sort((a, b) => b.timestamp - a.timestamp);

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
    redis:       { connected: redisConnected },
    queues:      queueStats,
    failedJobs:  failedJobs.slice(0, 20),
    supabase:    { connected: supabaseConnected },
    uptime:      process.uptime(),
    nodeVersion: process.version,
    memoryMb:    Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
}
