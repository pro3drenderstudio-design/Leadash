import { getWorkspaceContext } from "@/lib/workspace/context";
import { createAdminClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing/plans";
import LeadsClient from "./LeadsClient";

export default async function LeadsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return <LeadsClient poolUsed={0} poolMax={0} />;

  const { workspaceId } = ctx;
  const ws = ctx.workspace as { plan_id: string };
  const planId = ws.plan_id ?? "free";

  const db = createAdminClient();

  // Fetch pool limit from plan_configs (falls back to hardcoded plan)
  const [{ data: planConfig }, { count }] = await Promise.all([
    db.from("plan_configs").select("max_leads_pool").eq("plan_id", planId).maybeSingle(),
    db.from("outreach_leads").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);

  const plan = getPlan(planId);
  const poolMax: number = planConfig?.max_leads_pool ?? plan.maxLeadsPool;
  const poolUsed = count ?? 0;

  return <LeadsClient poolUsed={poolUsed} poolMax={poolMax} />;
}
