/**
 * Auto-detected challenge metrics.
 *
 * Some challenge tasks are completed by Leadash itself rather than by the
 * learner clicking anything — e.g. "Set up your professional inboxes (min 10)"
 * completes once the workspace has 10 connected inboxes, "Fill your ICP" once an
 * ICP exists, "Get 2,000 leads" once the pool reaches 2,000, etc.
 *
 * A metric task is auto-detected when its `metric_config.source` is one of
 * AUTO_METRIC_SOURCES. The challenge GET route evaluates these on every load
 * and finalizes any that are satisfied (value >= target). `has_plan` is
 * boolean (1/0); the rest are live counts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const AUTO_METRIC_SOURCES = [
  "has_inbox",
  "has_plan",
  "has_icp",
  "has_offer",
  "has_sequence",
  "leads_count",
  "verified_leads",
  "personalized_leads",
] as const;

export type AutoMetricSource = (typeof AUTO_METRIC_SOURCES)[number];

export interface MetricConfigLike {
  source?: string;
  metric?: string;
  target?: number;
  cta_label?: string;
  cta_url?: string;
}

export function isAutoMetricSource(source: unknown): source is AutoMetricSource {
  return typeof source === "string" && (AUTO_METRIC_SOURCES as readonly string[]).includes(source);
}

/** Sensible default CTA (label + in-app link) for each auto source. */
export function defaultCtaFor(source: AutoMetricSource): { label: string; url: string } {
  switch (source) {
    case "has_inbox":          return { label: "Set up your inboxes", url: "/inboxes" };
    case "has_plan":           return { label: "Choose your plan", url: "/settings" };
    case "has_icp":            return { label: "Fill your ICP template", url: "/playbook" };
    case "has_offer":          return { label: "Fill your offer template", url: "/playbook" };
    case "has_sequence":       return { label: "Create your first sequence", url: "/campaigns" };
    case "leads_count":        return { label: "Get leads", url: "/discover" };
    case "verified_leads":     return { label: "Verify your leads", url: "/lead-campaigns/verify" };
    case "personalized_leads": return { label: "Personalize your leads", url: "/lead-campaigns/enrich" };
  }
}

/**
 * Current numeric value of an auto-detected metric for a workspace, compared
 * against the task's `target`. Never throws — returns 0 on any read failure so
 * a transient error can't wrongly complete a task (it resolves on next load).
 */
export async function getAutoMetricValue(
  db: SupabaseClient,
  workspaceId: string,
  source: AutoMetricSource,
): Promise<number> {
  try {
    switch (source) {
      case "has_plan": {
        const { data } = await db.from("workspaces").select("plan_id").eq("id", workspaceId).maybeSingle();
        const planId = (data as { plan_id?: string | null } | null)?.plan_id ?? null;
        return planId && planId !== "free" ? 1 : 0;
      }
      case "has_inbox": {
        const { count } = await db
          .from("outreach_inboxes")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "active");
        return count ?? 0;
      }
      case "has_icp": {
        const { count } = await db.from("workspace_icps").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
        return count ?? 0;
      }
      case "has_offer": {
        const { count } = await db.from("workspace_offer_templates").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
        return count ?? 0;
      }
      case "has_sequence": {
        const { count } = await db.from("outreach_sequences").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
        return count ?? 0;
      }
      case "leads_count": {
        const { count } = await db
          .from("outreach_leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .is("deleted_at", null);
        return count ?? 0;
      }
      case "verified_leads": {
        const { count } = await db
          .from("outreach_leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .is("deleted_at", null)
          .not("verified_at", "is", null);
        return count ?? 0;
      }
      case "personalized_leads": {
        const { count } = await db
          .from("outreach_leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .is("deleted_at", null)
          .not("first_line", "is", null);
        return count ?? 0;
      }
    }
  } catch {
    return 0;
  }
  return 0;
}
