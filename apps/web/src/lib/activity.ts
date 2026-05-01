import { createAdminClient } from "@/lib/supabase/server";

export type ActivityType =
  | "new_workspace"
  | "subscription_started"
  | "subscription_upgraded"
  | "subscription_cancelled"
  | "domain_purchased"
  | "domain_provisioned"
  | "credit_purchase"
  | "support_ticket"
  | "lead_campaign_created"
  | "lead_campaign_completed"
  | "warmup_completed";

interface LogActivityParams {
  workspace_id?:   string;
  workspace_name?: string;
  user_email?:     string;
  type:            ActivityType;
  title:           string;
  description?:    string;
  metadata?:       Record<string, unknown>;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("admin_activity_log").insert(params);
  } catch {
    // Activity logging is non-fatal — never throw
  }
}
