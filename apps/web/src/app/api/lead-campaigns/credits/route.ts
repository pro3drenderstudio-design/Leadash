import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const [{ data: workspace }, { data: transactions }] = await Promise.all([
    db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single(),
    db.from("lead_credit_transactions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    balance:      workspace?.lead_credits_balance ?? 0,
    transactions: transactions ?? [],
  });
}
