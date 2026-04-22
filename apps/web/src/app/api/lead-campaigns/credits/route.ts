import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId } = auth;

  // Use admin client to bypass RLS on workspaces
  const admin = createAdminClient();

  const [{ data: workspace }, { data: transactions }] = await Promise.all([
    admin.from("workspaces").select("lead_credits_balance, subscription_credits_balance").eq("id", workspaceId).single(),
    admin.from("lead_credit_transactions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const totalBalance    = workspace?.lead_credits_balance ?? 0;
  const monthlyCredits  = workspace?.subscription_credits_balance ?? 0;
  const lifetimeCredits = Math.max(0, totalBalance - monthlyCredits);

  return NextResponse.json({
    balance:          totalBalance,
    monthly_credits:  monthlyCredits,
    lifetime_credits: lifetimeCredits,
    transactions:     transactions ?? [],
  });
}
