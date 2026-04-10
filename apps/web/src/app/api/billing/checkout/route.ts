import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { PLANS } from "@/lib/billing/plans";

function getStripe() { return new Stripe(process.env.STRIPE_SECRET_KEY!); }

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { plan_id } = await req.json();
  const plan = PLANS[plan_id as keyof typeof PLANS];
  if (!plan || !plan.stripePriceId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const { data: workspace } = await db
    .from("workspaces")
    .select("stripe_customer_id, billing_email, name")
    .eq("id", workspaceId)
    .single();

  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  let customerId = workspace.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    workspace.billing_email ?? undefined,
      name:     workspace.name,
      metadata: { workspace_id: workspaceId },
    });
    customerId = customer.id;
    await db.from("workspaces").update({ stripe_customer_id: customerId }).eq("id", workspaceId);
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const session = await stripe.checkout.sessions.create({
    customer:   customerId,
    mode:       "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${origin}/settings?billing=success`,
    cancel_url:  `${origin}/settings?billing=canceled`,
  });

  return NextResponse.json({ url: session.url });
}
