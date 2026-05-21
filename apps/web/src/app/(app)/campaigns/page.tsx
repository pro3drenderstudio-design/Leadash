import { Suspense } from "react";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { getPlanById } from "@/lib/billing/getActivePlans";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  const ctx = await getWorkspaceContext();
  const ws = ctx?.workspace as { plan_id: string; trial_ends_at: string | null } | null;

  const planId = ws?.plan_id ?? "free";
  const trialExpired = planId === "free" && !!ws?.trial_ends_at && new Date(ws.trial_ends_at) < new Date();
  const plan = await getPlanById(planId);
  const canRunCampaigns = !trialExpired && plan.can_run_campaigns;

  return (
    <Suspense fallback={<div className="p-6 text-white/40">Loading…</div>}>
      <CampaignsClient canRunCampaigns={canRunCampaigns} />
    </Suspense>
  );
}
