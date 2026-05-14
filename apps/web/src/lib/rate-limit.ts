import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Simple DB-backed rate limiter using the rate_limit_log table.
 * Returns true if request is allowed, false if rate limited.
 */
export async function checkRateLimit(
  db: SupabaseClient,
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  const { count } = await db
    .from("rate_limit_log")
    .select("*", { count: "exact", head: true })
    .eq("key", key)
    .gte("created_at", windowStart);

  if ((count ?? 0) >= maxRequests) return false;

  await db.from("rate_limit_log").insert({ key });
  return true;
}
