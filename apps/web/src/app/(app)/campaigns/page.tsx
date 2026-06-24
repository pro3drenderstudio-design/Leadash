import { Suspense } from "react";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { getPlanById } from "@/lib/billing/getActivePlans";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  const ctx = await getWorkspaceContext();
  const ws = ctx?.workspace as { plan_id: string } | null;

  // Trial gate removed — campaign access is bounded only by the plan's
  // `can_run_campaigns` flag now.
  const planId = ws?.plan_id ?? "free";
  const plan = await getPlanById(planId);
  const canRunCampaigns = plan.can_run_campaigns;

  return (
    <Suspense fallback={<div style={{ padding: 24, color: "var(--app-text-muted)" }}>Loading…</div>}>
      <CampaignsClient canRunCampaigns={canRunCampaigns} />
    </Suspense>
  );
}
