/**
 * POST /api/billing/change-plan
 *
 * Unified upgrade/downgrade: disables the workspace's existing Paystack
 * subscription (best-effort — some workspaces have no valid sub code to
 * disable, which must not block the plan change itself) and starts a fresh
 * checkout for the target plan, same shape as /api/billing/checkout.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { createPaystackCheckout, disablePaystackSubscription } from "@/lib/billing/paystack";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const allowed = await checkRateLimit(db, `change-plan:${workspaceId}`, 5, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { plan_id } = await req.json() as { plan_id?: string };
  const plan = await getPlanById(plan_id ?? "");

  if (!plan || plan.plan_id === "free") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  if (!plan.paystack_plan_code) {
    return NextResponse.json({ error: "This plan has no payment integration configured yet. Contact support." }, { status: 400 });
  }

  const { data: workspace } = await db
    .from("workspaces")
    .select("billing_email, name, plan_id, plan_status, paystack_sub_code")
    .eq("id", workspaceId)
    .single();
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  if (workspace.plan_id === plan.plan_id && workspace.plan_status === "active") {
    return NextResponse.json({ error: "You are already subscribed to this plan." }, { status: 400 });
  }

  // Best-effort — a workspace can be mid-plan with no valid sub code (the exact
  // drift billing-reconcile watches for); that must not block switching plans.
  if (workspace.paystack_sub_code) {
    try {
      const res = await fetch(`https://api.paystack.co/subscription/${workspace.paystack_sub_code}`, {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      });
      const json = await res.json() as { data?: { email_token?: string } };
      const emailToken = json.data?.email_token;
      if (emailToken) {
        await disablePaystackSubscription({ code: workspace.paystack_sub_code, emailToken });
      }
    } catch (err) {
      console.error(`[billing/change-plan] failed to disable old subscription ws=${workspaceId}:`, err instanceof Error ? err.message : err);
    }
  }

  const planCodeEnvKey = `PAYSTACK_PLAN_CODE_${plan.plan_id.toUpperCase().replace(/-/g, "_")}`;
  const planCode = process.env[planCodeEnvKey] ?? plan.paystack_plan_code;
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  try {
    const { authorizationUrl } = await createPaystackCheckout({
      email:       workspace.billing_email ?? `ws-${workspaceId}@leadash.app`,
      amountKobo:  plan.price_ngn * 100,
      planCode,
      callbackUrl: `${origin}/settings?tab=billing&billing=success&plan=${plan.plan_id}`,
      metadata: {
        workspace_id: workspaceId,
        plan_id:      plan.plan_id,
        type:         "plan_subscription",
      },
    });
    return NextResponse.json({ url: authorizationUrl });
  } catch (err) {
    console.error("[billing/change-plan]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payment initialization failed" }, { status: 502 });
  }
}
