import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/billing/plans";
import { getPlanById } from "@/lib/billing/getActivePlans";

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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

    // Grant included monthly credits on successful invoice payment
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      // Only recurring subscription invoices (not the first draft or setup)
      if (inv.billing_reason !== "subscription_cycle" && inv.billing_reason !== "subscription_create") break;
      if (!inv.customer) break;

      const { data: ws } = await db
        .from("workspaces")
        .select("id, plan_id, lead_credits_balance, subscription_credits_balance")
        .eq("stripe_customer_id", inv.customer as string)
        .maybeSingle();

      if (!ws) break;

      const planConfig = await getPlanById(ws.plan_id ?? "free");
      if (planConfig.included_credits <= 0) break;

      const isRenewal = inv.billing_reason === "subscription_cycle";
      const currentSub  = ws.subscription_credits_balance ?? 0;
      const currentTotal = ws.lead_credits_balance ?? 0;

      // On renewal: expire unused subscription credits, then grant new ones.
      // On first activation: simply add the granted credits.
      const newTotal = isRenewal
        ? currentTotal - currentSub + planConfig.included_credits
        : currentTotal + planConfig.included_credits;

      await db.from("workspaces")
        .update({
          lead_credits_balance:         Math.max(0, newTotal),
          subscription_credits_balance: planConfig.included_credits,
        })
        .eq("id", ws.id);
      await db.from("lead_credit_transactions").insert({
        workspace_id: ws.id,
        type:         "grant",
        amount:       planConfig.included_credits,
        description:  `Monthly credits — ${planConfig.name} plan${isRenewal ? " renewal" : ""}`,
      });
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
