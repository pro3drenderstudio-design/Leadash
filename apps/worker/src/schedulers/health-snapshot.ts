import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { Queue } from "bullmq";
import { connection } from "../lib/redis";
import { adminClient } from "../lib/supabase";
import { upsertNotification, resolveNotification } from "../lib/notify";

const execAsync = promisify(exec);

const APP_URL     = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const QUEUE_NAMES = [
  "leadash:send",
  "leadash:reply-poll",
  "leadash:warmup",
  "leadash:webhook",
  "leadash:lead-campaign",
  "leadash:verify-bulk",
  "leadash:enrich-bulk",
  "leadash:provision",
] as const;

const QUEUE_LABELS: Record<string, string> = {
  "leadash:send":          "Send",
  "leadash:reply-poll":    "Reply Poll",
  "leadash:warmup":        "Warmup",
  "leadash:webhook":       "Webhook",
  "leadash:lead-campaign": "Lead Campaign",
  "leadash:verify-bulk":   "Verify Bulk",
  "leadash:enrich-bulk":   "Enrich Bulk",
  "leadash:provision":     "Provision",
};

interface Thresholds {
  redis_memory_warning?:   number; // default 70
  redis_memory_critical?:  number; // default 90
  ram_warning?:            number; // default 75
  ram_critical?:           number; // default 90
  disk_warning?:           number; // default 75
  disk_critical?:          number; // default 90
  queue_failed_warning?:   number; // default 50
  queue_failed_critical?:  number; // default 500
  queue_waiting_critical?: number; // default 10000
}

function parseRedisInfo(info: string, key: string): number {
  const m = info.match(new RegExp(`^${key}:(\\S+)`, "m"));
  return m ? parseFloat(m[1]) : 0;
}

async function getRedisStats() {
  try {
    const [memInfo, clientInfo] = await Promise.all([
      connection.info("memory"),
      connection.info("clients"),
    ]);
    const used      = parseRedisInfo(memInfo, "used_memory");
    const max       = parseRedisInfo(memInfo, "maxmemory");
    const evicted   = parseRedisInfo(memInfo, "evicted_keys");
    const clients   = parseRedisInfo(clientInfo, "connected_clients");
    const used_mb   = Math.round(used / 1024 / 1024);
    const max_mb    = max > 0 ? Math.round(max / 1024 / 1024) : 0;
    const pct       = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
    return { memory_used_mb: used_mb, memory_max_mb: max_mb, memory_pct: pct, connected_clients: clients, evicted_keys: evicted };
  } catch {
    return null;
  }
}

async function getQueueStats() {
  const stats = [];
  for (const name of QUEUE_NAMES) {
    try {
      const q = new Queue(name, { connection });
      const [waiting, active, failed, delayed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getFailedCount(),
        q.getDelayedCount(),
      ]);
      await q.close();
      stats.push({ name, label: QUEUE_LABELS[name] ?? name, waiting, active, failed, delayed });
    } catch {
      stats.push({ name, label: QUEUE_LABELS[name] ?? name, waiting: 0, active: 0, failed: 0, delayed: 0 });
    }
  }
  return stats;
}

async function getServerStats() {
  try {
    const cpus         = os.cpus();
    const [l1, l5, l15] = os.loadavg();
    const totalRam     = os.totalmem();
    const freeRam      = os.freemem();
    const usedRam      = totalRam - freeRam;

    let disk_used_gb = 0, disk_total_gb = 0;
    try {
      const { stdout } = await execAsync("df -k / 2>/dev/null | tail -1");
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 3) {
        disk_total_gb = Math.round(parseInt(parts[1]) / 1024 / 1024 * 10) / 10;
        disk_used_gb  = Math.round(parseInt(parts[2]) / 1024 / 1024 * 10) / 10;
      }
    } catch { /* disk stats non-fatal */ }

    return {
      cpu_load_1m:   Math.round(l1  * 100) / 100,
      cpu_load_5m:   Math.round(l5  * 100) / 100,
      cpu_load_15m:  Math.round(l15 * 100) / 100,
      cpu_cores:     cpus.length,
      ram_used_mb:   Math.round(usedRam  / 1024 / 1024),
      ram_total_mb:  Math.round(totalRam / 1024 / 1024),
      ram_pct:       Math.min(100, Math.round((usedRam / totalRam) * 100)),
      disk_used_gb,
      disk_total_gb,
      disk_pct:      disk_total_gb > 0 ? Math.min(100, Math.round((disk_used_gb / disk_total_gb) * 100)) : 0,
    };
  } catch {
    return null;
  }
}

async function getAppStats(db: ReturnType<typeof adminClient>) {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [inboxRows, campaigns, workspaces, sends, held] = await Promise.all([
      db.from("outreach_inboxes").select("status, warmup_enabled"),
      db.from("outreach_campaigns").select("id", { count: "exact", head: true }).in("status", ["running", "active"]),
      db.from("workspaces").select("id", { count: "exact", head: true }).in("plan_status", ["active", "trialing"]),
      db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("status", "sent").gte("created_at", todayStart.toISOString()),
      db.from("outreach_sends").select("id", { count: "exact", head: true }).eq("status", "queued"),
    ]);

    const inboxes = inboxRows.data ?? [];
    return {
      total_inboxes:     inboxes.length,
      active_inboxes:    inboxes.filter((i: { status: string }) => i.status === "active").length,
      error_inboxes:     inboxes.filter((i: { status: string }) => i.status === "error").length,
      warming_inboxes:   inboxes.filter((i: { warmup_enabled: boolean }) => i.warmup_enabled).length,
      active_campaigns:  campaigns.count  ?? 0,
      active_workspaces: workspaces.count ?? 0,
      sends_today:       sends.count      ?? 0,
      queued_sends:      held.count       ?? 0,
    };
  } catch {
    return null;
  }
}

async function checkWorkspacePlanCaps(db: ReturnType<typeof adminClient>) {
  try {
    const { data: wsList } = await db
      .from("workspaces")
      .select("id, name, max_inboxes")
      .in("plan_status", ["active", "trialing"])
      .gt("max_inboxes", 0);

    for (const ws of wsList ?? []) {
      const { count } = await db
        .from("outreach_inboxes")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws.id);

      const used = count ?? 0;
      const max  = ws.max_inboxes as number;
      const pct  = Math.round((used / max) * 100);

      if (pct >= 100) {
        await upsertNotification({
          type: "inbox_limit", severity: "critical",
          title: `${ws.name} at inbox limit (${used}/${max})`,
          body:  "This workspace cannot add more inboxes until the plan is upgraded.",
          metadata: { workspace_id: ws.id, used, max, pct },
          workspace_id: ws.id,
          dedup_key: `inbox_limit:${ws.id}:critical`,
        });
        await resolveNotification(`inbox_limit:${ws.id}:warning`);
      } else if (pct >= 80) {
        await upsertNotification({
          type: "inbox_limit", severity: "warning",
          title: `${ws.name} at ${pct}% of inbox limit (${used}/${max})`,
          metadata: { workspace_id: ws.id, used, max, pct },
          workspace_id: ws.id,
          dedup_key: `inbox_limit:${ws.id}:warning`,
        });
        await resolveNotification(`inbox_limit:${ws.id}:critical`);
      } else {
        await resolveNotification(`inbox_limit:${ws.id}:warning`);
        await resolveNotification(`inbox_limit:${ws.id}:critical`);
      }
    }
  } catch { /* non-fatal */ }
}

async function checkTrialExpiry(db: ReturnType<typeof adminClient>) {
  try {
    const now    = new Date();
    const in3d   = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const today  = new Date(now.setUTCHours(23, 59, 59, 999)).toISOString();

    // Trials expiring within 3 days
    const { data: expiring } = await db
      .from("workspaces")
      .select("id, name, trial_ends_at")
      .eq("plan_id", "free")
      .not("trial_ends_at", "is", null)
      .lte("trial_ends_at", in3d)
      .gte("trial_ends_at", new Date().toISOString());

    for (const ws of expiring ?? []) {
      const daysLeft = Math.ceil(
        (new Date(ws.trial_ends_at as string).getTime() - Date.now()) / 86_400_000
      );
      const isToday    = daysLeft <= 0;
      const severity   = isToday ? "warning" : "info";
      const dedupKey   = `trial:${ws.id}:expiring`;

      await upsertNotification({
        type: "trial", severity,
        title: isToday
          ? `${ws.name} trial expires today`
          : `${ws.name} trial expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
        metadata: { workspace_id: ws.id, trial_ends_at: ws.trial_ends_at, days_left: daysLeft },
        workspace_id: ws.id,
        dedup_key: dedupKey,
      });
    }

    // Resolve expiry notices for workspaces whose trial already expired (they're past the notice)
    const { data: expired } = await db
      .from("workspaces")
      .select("id")
      .eq("plan_id", "free")
      .not("trial_ends_at", "is", null)
      .lt("trial_ends_at", new Date().toISOString());

    for (const ws of expired ?? []) {
      await resolveNotification(`trial:${ws.id}:expiring`);
    }
  } catch { /* non-fatal */ }
}

async function evaluateThresholds(
  redis:  Awaited<ReturnType<typeof getRedisStats>>,
  queues: Awaited<ReturnType<typeof getQueueStats>>,
  server: Awaited<ReturnType<typeof getServerStats>>,
  t:      Required<Thresholds>,
) {
  // ── Redis memory ────────────────────────────────────────────────────────────
  if (redis && redis.memory_pct > 0) {
    if (redis.memory_pct >= t.redis_memory_critical) {
      await upsertNotification({
        type: "infra", severity: "critical",
        title: `Redis memory critical — ${redis.memory_pct}% used`,
        body:  `${redis.memory_used_mb}MB of ${redis.memory_max_mb}MB. Risk of OOM errors and stalled jobs.`,
        metadata: { ...redis },
        dedup_key: "infra:redis_memory:critical",
      });
      await resolveNotification("infra:redis_memory:warning");
    } else if (redis.memory_pct >= t.redis_memory_warning) {
      await upsertNotification({
        type: "infra", severity: "warning",
        title: `Redis memory high — ${redis.memory_pct}% used`,
        body:  `${redis.memory_used_mb}MB of ${redis.memory_max_mb}MB.`,
        metadata: { ...redis },
        dedup_key: "infra:redis_memory:warning",
      });
      await resolveNotification("infra:redis_memory:critical");
    } else {
      await resolveNotification("infra:redis_memory:warning");
      await resolveNotification("infra:redis_memory:critical");
    }
  }

  // ── Server RAM ──────────────────────────────────────────────────────────────
  if (server) {
    if (server.ram_pct >= t.ram_critical) {
      await upsertNotification({
        type: "infra", severity: "critical",
        title: `Server RAM critical — ${server.ram_pct}% used`,
        body:  `${server.ram_used_mb}MB of ${server.ram_total_mb}MB used.`,
        metadata: { ram_pct: server.ram_pct, ram_used_mb: server.ram_used_mb, ram_total_mb: server.ram_total_mb },
        dedup_key: "infra:ram:critical",
      });
      await resolveNotification("infra:ram:warning");
    } else if (server.ram_pct >= t.ram_warning) {
      await upsertNotification({
        type: "infra", severity: "warning",
        title: `Server RAM high — ${server.ram_pct}% used`,
        body:  `${server.ram_used_mb}MB of ${server.ram_total_mb}MB used.`,
        metadata: { ram_pct: server.ram_pct, ram_used_mb: server.ram_used_mb, ram_total_mb: server.ram_total_mb },
        dedup_key: "infra:ram:warning",
      });
      await resolveNotification("infra:ram:critical");
    } else {
      await resolveNotification("infra:ram:warning");
      await resolveNotification("infra:ram:critical");
    }

    // ── Disk ──────────────────────────────────────────────────────────────────
    if (server.disk_total_gb > 0) {
      if (server.disk_pct >= t.disk_critical) {
        await upsertNotification({
          type: "infra", severity: "critical",
          title: `Disk space critical — ${server.disk_pct}% used`,
          body:  `${server.disk_used_gb}GB of ${server.disk_total_gb}GB used.`,
          metadata: { disk_pct: server.disk_pct, disk_used_gb: server.disk_used_gb, disk_total_gb: server.disk_total_gb },
          dedup_key: "infra:disk:critical",
        });
        await resolveNotification("infra:disk:warning");
      } else if (server.disk_pct >= t.disk_warning) {
        await upsertNotification({
          type: "infra", severity: "warning",
          title: `Disk space high — ${server.disk_pct}% used`,
          body:  `${server.disk_used_gb}GB of ${server.disk_total_gb}GB used.`,
          metadata: { disk_pct: server.disk_pct, disk_used_gb: server.disk_used_gb, disk_total_gb: server.disk_total_gb },
          dedup_key: "infra:disk:warning",
        });
        await resolveNotification("infra:disk:critical");
      } else {
        await resolveNotification("infra:disk:warning");
        await resolveNotification("infra:disk:critical");
      }
    }
  }

  // ── Queues ──────────────────────────────────────────────────────────────────
  for (const q of queues) {
    // Failed jobs
    if (q.failed >= t.queue_failed_critical) {
      await upsertNotification({
        type: "queue", severity: "critical",
        title: `${q.label} queue — ${q.failed.toLocaleString()} failed jobs`,
        body:  "High failure rate may indicate a systemic error. Check failed job reasons.",
        metadata: { queue: q.name, label: q.label, failed: q.failed },
        dedup_key: `queue:${q.name}:failed:critical`,
      });
      await resolveNotification(`queue:${q.name}:failed:warning`);
    } else if (q.failed >= t.queue_failed_warning) {
      await upsertNotification({
        type: "queue", severity: "warning",
        title: `${q.label} queue — ${q.failed.toLocaleString()} failed jobs`,
        metadata: { queue: q.name, label: q.label, failed: q.failed },
        dedup_key: `queue:${q.name}:failed:warning`,
      });
      await resolveNotification(`queue:${q.name}:failed:critical`);
    } else {
      await resolveNotification(`queue:${q.name}:failed:warning`);
      await resolveNotification(`queue:${q.name}:failed:critical`);
    }

    // Queue backlog
    if (q.waiting >= t.queue_waiting_critical) {
      await upsertNotification({
        type: "queue", severity: "critical",
        title: `${q.label} queue backlog — ${q.waiting.toLocaleString()} waiting`,
        body:  "Queue is not draining fast enough. Worker may be overloaded.",
        metadata: { queue: q.name, label: q.label, waiting: q.waiting },
        dedup_key: `queue:${q.name}:waiting:critical`,
      });
    } else {
      await resolveNotification(`queue:${q.name}:waiting:critical`);
    }
  }
}

export async function runHealthSnapshot(): Promise<void> {
  const db = adminClient();

  // Load threshold overrides from settings
  const { data: settings } = await db
    .from("notification_settings")
    .select("thresholds")
    .limit(1)
    .maybeSingle();

  const raw = (settings?.thresholds ?? {}) as Thresholds;
  const thresholds: Required<Thresholds> = {
    redis_memory_warning:   raw.redis_memory_warning   ?? 70,
    redis_memory_critical:  raw.redis_memory_critical  ?? 90,
    ram_warning:            raw.ram_warning            ?? 75,
    ram_critical:           raw.ram_critical           ?? 90,
    disk_warning:           raw.disk_warning           ?? 75,
    disk_critical:          raw.disk_critical          ?? 90,
    queue_failed_warning:   raw.queue_failed_warning   ?? 50,
    queue_failed_critical:  raw.queue_failed_critical  ?? 500,
    queue_waiting_critical: raw.queue_waiting_critical ?? 10_000,
  };

  const [redis, queues, server, appStats] = await Promise.all([
    getRedisStats(),
    getQueueStats(),
    getServerStats(),
    getAppStats(db),
  ]);

  // Write snapshot
  await db.from("system_health_snapshots").insert({
    redis,
    queues,
    server,
    db_stats: appStats,
    postal:   null,
  });

  // Prune snapshots older than 7 days
  await db
    .from("system_health_snapshots")
    .delete()
    .lt("captured_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  // Evaluate thresholds + fire/resolve notifications
  await evaluateThresholds(redis, queues, server, thresholds);

  // Run workspace-level checks every snapshot cycle (these have their own dedup)
  await Promise.all([
    checkWorkspacePlanCaps(db),
    checkTrialExpiry(db),
  ]);

  // Trigger email dispatch on web app (fire-and-forget)
  if (APP_URL && CRON_SECRET) {
    fetch(`${APP_URL}/api/admin/notifications/send-pending`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    }).catch(() => {});
  }

  console.log(
    `[health] snapshot | redis=${redis?.memory_pct ?? "?"}% | ram=${server?.ram_pct ?? "?"}% | disk=${server?.disk_pct ?? "?"}% | queues=${queues.length}`
  );
}
