import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { getUsdToNgn } from "@/lib/billing/exchangeRate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { data: ws } = await db
    .from("workspaces")
    .select("plan_id")
    .eq("id", workspaceId)
    .single();

  const plan      = await getPlanById(ws?.plan_id ?? "free");
  const ngnPerUsd = await getUsdToNgn();

  return NextResponse.json({
    inbox_monthly_price_ngn: plan.inbox_monthly_price_ngn,
    ngn_per_usd:             ngnPerUsd,
  });
}
