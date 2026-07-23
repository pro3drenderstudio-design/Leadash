import IORedis from "ioredis";
import { createHash } from "node:crypto";

let _redis: IORedis | null = null;

function getRedis(): IORedis | null {
  if (!process.env.UPSTASH_REDIS_URL) return null;
  if (!_redis) {
    _redis = new IORedis(process.env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck:     false,
      lazyConnect:          true,
      tls: process.env.UPSTASH_REDIS_URL.startsWith("rediss://") ? {} : undefined,
    });
    _redis.on("error", () => {}); // non-fatal — cache misses are fine
  }
  return _redis;
}

// Cache TTL: 2 hours. Search results don't change that frequently.
const CACHE_TTL_SECS = 7_200;

// Build a stable cache key from search params. `page`/`limit` MUST be part of
// the key — otherwise every page of the same search collides on one entry and
// pages 2+ return the cached page-1 results. Only truly page-invariant knobs
// (skip_count) and workspace-specific params (net_new, ids_only) are excluded.
export function searchCacheKey(params: URLSearchParams): string {
  const stable = [...params.entries()]
    .filter(([k]) => !["skip_count", "net_new", "ids_only"].includes(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const hash = createHash("sha256")
    .update(new URLSearchParams(stable).toString())
    .digest("hex")
    .slice(0, 20);
  return `discover:v1:${hash}`;
}

export async function getCachedSearch(key: string): Promise<object | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as object) : null;
  } catch {
    return null;
  }
}

export async function setCachedSearch(key: string, data: object): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(data), "EX", CACHE_TTL_SECS);
  } catch {
    // non-fatal
  }
}

// ── Discover maintenance mode ────────────────────────────────────────────────
// Toggled from ops (Redis key) so the leads DB isn't queried during heavy
// maintenance (e.g. rebuilding discover_people). Set: SET discover:maintenance
// "<message>"; clear: DEL discover:maintenance. Short-cached to avoid a Redis
// round-trip on every search.
const MAINT_KEY = "discover:maintenance";
let _maintCache: { at: number; msg: string | null } = { at: 0, msg: null };

export async function getDiscoverMaintenance(): Promise<string | null> {
  if (Date.now() - _maintCache.at < 15_000) return _maintCache.msg;
  const redis = getRedis();
  if (!redis) return null;
  try {
    const msg = await redis.get(MAINT_KEY);
    _maintCache = { at: Date.now(), msg: msg || null };
    return _maintCache.msg;
  } catch {
    return null;
  }
}

/**
 * Cache the workspace's existing-email set (used by NET NEW filter on the
 * discover search endpoint). Refetching this from Supabase RPC on every
 * search is expensive for established workspaces (5–50k+ rows). 60s TTL is
 * short enough that "add leads then search again" shows the new dedup
 * within a minute, long enough that filter-toggling doesn't re-query.
 */
const WS_EMAILS_TTL_SECS = 60;

export async function getCachedWorkspaceEmails(workspaceId: string): Promise<string[] | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`discover:ws-emails:${workspaceId}`);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

export async function setCachedWorkspaceEmails(workspaceId: string, emails: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`discover:ws-emails:${workspaceId}`, JSON.stringify(emails), "EX", WS_EMAILS_TTL_SECS);
  } catch {
    // non-fatal
  }
}

/** Bust the cache after operations that add leads (export, campaign add, list add). */
export async function invalidateWorkspaceEmails(workspaceId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`discover:ws-emails:${workspaceId}`);
  } catch {
    // non-fatal
  }
}

// Per-workspace sliding-window rate limiter: 60 requests / 60 seconds.
// Fails open — if Redis is down, requests go through.
const RATE_LIMIT   = 60;  // requests
const RATE_WINDOW  = 60;  // seconds

export async function checkDiscoverRateLimit(
  workspaceId: string,
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const redis = getRedis();
  if (!redis) return { allowed: true, remaining: RATE_LIMIT };

  const key = `discover:rl:${workspaceId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, RATE_WINDOW);
    const remaining = Math.max(0, RATE_LIMIT - count);
    if (count > RATE_LIMIT) {
      const ttl = await redis.ttl(key);
      return { allowed: false, remaining: 0, retryAfter: ttl > 0 ? ttl : RATE_WINDOW };
    }
    return { allowed: true, remaining };
  } catch {
    return { allowed: true, remaining: RATE_LIMIT };
  }
}
