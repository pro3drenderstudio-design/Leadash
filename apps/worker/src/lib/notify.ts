import { adminClient } from "./supabase";

export type NotificationSeverity = "info" | "warning" | "critical";
export type NotificationType = "infra" | "queue" | "postal" | "inbox_limit" | "trial" | "warmup";

export interface NotificationOpts {
  type:         NotificationType;
  severity:     NotificationSeverity;
  title:        string;
  body?:        string;
  metadata?:    Record<string, unknown>;
  workspace_id?: string;
  dedup_key:    string;
}

// Minimum gap before re-firing after a condition resolves and re-triggers
const COOLDOWN_MS: Record<NotificationSeverity, number> = {
  critical: 15 * 60 * 1000,    // 15 min
  warning:  60 * 60 * 1000,    // 1 hour
  info:     4  * 60 * 60 * 1000, // 4 hours
};

/**
 * Create a notification for a threshold violation.
 * Deduplicates: if an active (unresolved) notification with the same dedup_key
 * already exists, this is a no-op. Also respects a cooldown after resolution.
 */
export async function upsertNotification(opts: NotificationOpts): Promise<void> {
  const db = adminClient();

  // Already an active notification for this condition — skip
  const { data: active } = await db
    .from("notifications")
    .select("id")
    .eq("dedup_key", opts.dedup_key)
    .is("resolved_at", null)
    .maybeSingle();

  if (active) return;

  // Within cooldown window after last resolution — skip
  const cooldownCutoff = new Date(Date.now() - COOLDOWN_MS[opts.severity]).toISOString();
  const { data: recentlyResolved } = await db
    .from("notifications")
    .select("id")
    .eq("dedup_key", opts.dedup_key)
    .not("resolved_at", "is", null)
    .gte("resolved_at", cooldownCutoff)
    .limit(1)
    .maybeSingle();

  if (recentlyResolved) return;

  await db.from("notifications").insert({
    type:         opts.type,
    severity:     opts.severity,
    title:        opts.title,
    body:         opts.body         ?? null,
    metadata:     opts.metadata     ?? null,
    workspace_id: opts.workspace_id ?? null,
    dedup_key:    opts.dedup_key,
  });
}

/**
 * Mark an active notification as resolved (condition cleared).
 * Safe to call even if no active notification exists.
 */
export async function resolveNotification(dedupKey: string): Promise<void> {
  const db = adminClient();
  await db
    .from("notifications")
    .update({ resolved_at: new Date().toISOString() })
    .eq("dedup_key", dedupKey)
    .is("resolved_at", null);
}
