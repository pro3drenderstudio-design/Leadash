import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/billing/plans";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = createAdminClient();

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub  = event.data.object as Stripe.Subscription;
      const item = sub.items.data[0];
      const priceId = item?.price.id;

      const plan = Object.values(PLANS).find(p => p.stripePriceId === priceId);
      if (!plan) break;

      await db
        .from("workspaces")
        .update({
          plan_id:           plan.id,
          plan_status:       sub.status as string,
          stripe_sub_id:     sub.id,
          max_inboxes:       plan.maxInboxes,
          max_monthly_sends: plan.maxMonthlySends,
          max_seats:         plan.maxSeats,
          updated_at:        new Date().toISOString(),
        })
        .eq("stripe_customer_id", sub.customer as string);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .from("workspaces")
        .update({
          plan_id:     "free",
          plan_status: "canceled",
          stripe_sub_id: null,
          max_inboxes:       PLANS.free.maxInboxes,
          max_monthly_sends: PLANS.free.maxMonthlySends,
          max_seats:         PLANS.free.maxSeats,
        })
        .eq("stripe_customer_id", sub.customer as string);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
