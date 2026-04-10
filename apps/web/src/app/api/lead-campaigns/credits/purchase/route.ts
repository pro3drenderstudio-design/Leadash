import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { requireWorkspace } from "@/lib/api/workspace";
import { CREDIT_PACKS } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const auth   = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const { pack_id } = await req.json();
  const pack = CREDIT_PACKS.find(p => p.id === pack_id);
  if (!pack) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  if (!pack.stripe_price_id) {
    return NextResponse.json({ error: "Pack not yet available for purchase" }, { status: 400 });
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
    customer:    customerId,
    mode:        "payment",
    line_items:  [{ price: pack.stripe_price_id, quantity: 1 }],
    success_url: `${origin}/lead-campaigns/credits?purchase=success&credits=${pack.credits}`,
    cancel_url:  `${origin}/lead-campaigns/credits`,
    metadata:    {
      workspace_id: workspaceId,
      pack_id:      pack.id,
      credits:      String(pack.credits),
    },
  });

  return NextResponse.json({ url: session.url });
}
