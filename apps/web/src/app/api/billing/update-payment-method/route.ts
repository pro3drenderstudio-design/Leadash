/**
 * POST /api/billing/update-payment-method
 *
 * Starts a fresh Paystack checkout for the workspace's current plan price —
 * the resulting authorization_code becomes the new saved card. Charging one
 * cycle's worth (rather than a nominal amount) doubles as "catch up if
 * past_due" — mirrors the existing per-domain inbox equivalent
 * (/api/outreach/domains/[id]/new-payment + /update-payment).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { createPaystackCheckout } from "@/lib/billing/paystack";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const allowed = await checkRateLimit(db, `update-payment-method:${workspaceId}`, 5, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const { data: workspace } = await db
    .from("workspaces")
    .select("billing_email, plan_id")
    .eq("id", workspaceId)
    .single();
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!workspace.plan_id || workspace.plan_id === "free") {
    return NextResponse.json({ error: "No paid plan to update payment for." }, { status: 400 });
  }

  const plan = await getPlanById(workspace.plan_id);
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;

  try {
    const { authorizationUrl } = await createPaystackCheckout({
      email:       workspace.billing_email ?? `ws-${workspaceId}@leadash.app`,
      amountKobo:  plan.price_ngn * 100,
      callbackUrl: `${origin}/settings?tab=billing&update_payment=success`,
      metadata: {
        workspace_id: workspaceId,
        type:         "plan_payment_method_update",
      },
    });
    return NextResponse.json({ url: authorizationUrl });
  } catch (err) {
    console.error("[billing/update-payment-method]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Payment initialization failed" }, { status: 502 });
  }
}
