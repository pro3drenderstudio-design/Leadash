import { createAdminClient } from "@/lib/supabase/server";

export class LimitError extends Error {
  constructor(
    public resource: string,
    public current: number,
    public max: number,
    public planId: string,
  ) {
    super(`${resource} limit reached (${current}/${max} on ${planId} plan)`);
    this.name = "LimitError";
  }
}

async function getWorkspace(workspaceId: string) {
  const db = createAdminClient();
  const { data } = await db.from("workspaces").select("*").eq("id", workspaceId).single();
  if (!data) throw new Error("Workspace not found");
  return data;
}

export async function enforceInboxLimit(workspaceId: string) {
  const db = createAdminClient();
  const ws = await getWorkspace(workspaceId);
  const { count } = await db
    .from("outreach_inboxes")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if ((count ?? 0) >= ws.max_inboxes) {
    throw new LimitError("inbox", count ?? 0, ws.max_inboxes, ws.plan_id);
  }
}

export async function enforceSeatLimit(workspaceId: string) {
  const db = createAdminClient();
  const ws = await getWorkspace(workspaceId);
  if (ws.max_seats === -1) return; // unlimited
  const { count } = await db
    .from("workspace_members")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if ((count ?? 0) >= ws.max_seats) {
    throw new LimitError("seat", count ?? 0, ws.max_seats, ws.plan_id);
  }
}

export async function enforceMonthlySendLimit(workspaceId: string, quantity = 1) {
  const ws = await getWorkspace(workspaceId);
  if (ws.sends_this_month + quantity > ws.max_monthly_sends) {
    throw new LimitError("monthly_sends", ws.sends_this_month, ws.max_monthly_sends, ws.plan_id);
  }
}
