import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { createPaystackCheckout } from "@/lib/billing/paystack";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { plan_id } = await req.json();
  const plan = await getPlanById(plan_id);

  if (!plan || plan.plan_id === "free") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  if (!plan.paystack_plan_code) {
    return NextResponse.json(
      { error: "This plan has no payment integration configured yet. Contact support." },
      { status: 400 }
    );
  }

  const { data: workspace } = await db
    .from("workspaces")
    .select("billing_email, name")
    .eq("id", workspaceId)
    .single();

  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  const { authorizationUrl } = await createPaystackCheckout({
    email:       workspace.billing_email ?? `ws-${workspaceId}@leadash.app`,
    amountKobo:  plan.price_ngn * 100,
    planCode:    plan.paystack_plan_code,
    callbackUrl: `${origin}/settings?billing=success&plan=${plan.plan_id}`,
    metadata: {
      workspace_id: workspaceId,
      plan_id:      plan.plan_id,
      type:         "plan_subscription",
    },
  });

  return NextResponse.json({ url: authorizationUrl });
}
