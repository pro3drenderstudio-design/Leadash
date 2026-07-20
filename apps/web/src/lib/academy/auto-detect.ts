/**
 * Auto-detected challenge metrics.
 *
 * Some challenge tasks are completed by Leadash itself rather than by the
 * learner clicking anything — e.g. "Get your professional email inboxes"
 * completes the moment the workspace has a connected inbox, and "Create your
 * Leadash workspace" completes once the workspace is on a paid plan.
 *
 * A metric task is auto-detected when its `metric_config.source` is one of
 * AUTO_METRIC_SOURCES. The challenge GET route evaluates these on every load
 * and finalizes any that are satisfied (see resolveAutoTasks).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AutoMetricSource = "has_inbox" | "has_plan";

export interface MetricConfigLike {
  source?: string;
  metric?: string;
  target?: number;
  cta_label?: string;
  cta_url?: string;
}

export function isAutoMetricSource(source: unknown): source is AutoMetricSource {
  return source === "has_inbox" || source === "has_plan";
}

/** Sensible default CTA (label + in-app link) for each auto source. */
export function defaultCtaFor(source: AutoMetricSource): { label: string; url: string } {
  if (source === "has_inbox") return { label: "Set up your inboxes", url: "/inboxes" };
  return { label: "Choose your plan", url: "/settings" };
}

/**
 * Current numeric value of an auto-detected metric for a workspace. Compared
 * against the task's `target` (default 1) to decide completion. Never throws —
 * returns 0 on any read failure so a transient error can't wrongly complete a
 * task (it'll just resolve on the next load).
 */
export async function getAutoMetricValue(
  db: SupabaseClient,
  workspaceId: string,
  source: AutoMetricSource,
): Promise<number> {
  try {
    if (source === "has_inbox") {
      const { count } = await db
        .from("outreach_inboxes")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      return count ?? 0;
    }
    if (source === "has_plan") {
      const { data } = await db
        .from("workspaces")
        .select("plan_id")
        .eq("id", workspaceId)
        .maybeSingle();
      const planId = (data as { plan_id?: string | null } | null)?.plan_id ?? null;
      return planId && planId !== "free" ? 1 : 0;
    }
  } catch {
    return 0;
  }
  return 0;
}
