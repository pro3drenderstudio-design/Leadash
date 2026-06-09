import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/billing/plans";
import { getPlanById, getActivePlans } from "@/lib/billing/getActivePlans";
import { logActivity } from "@/lib/activity";
import { downgradeWorkspaceToFree } from "@/lib/billing/downgrade";
import { sendSubscriptionRenewalSuccessEmail, sendDowngradeNotification } from "@/lib/email/notifications";

async function resolveStripeEmail(
  db: ReturnType<typeof createAdminClient>,
  customerId: string,
): Promise<{ email: string | null; name: string | null }> {
  const { data: ws } = await db
    .from("workspaces")
    .select("id, name, billing_email, workspace_members(user_id)")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!ws) return { email: null, name: null };
  if (ws.billing_email) return { email: ws.billing_email, name: ws.name };
  const userId = (ws as unknown as { workspace_members: Array<{ user_id: string }> }).workspace_members?.[0]?.user_id;
  if (!userId) return { email: null, name: ws.name };
  try {
    const { data: { user } } = await db.auth.admin.getUserById(userId);
    return { email: user?.email ?? null, name: ws.name };
  } catch { return { email: null, name: ws.name }; }
}

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

      // Match against DB-authoritative plan configs first, fall back to hardcoded
      const allPlans  = await getActivePlans().catch(() => null);
      const dbPlan    = allPlans?.find(p => p.stripe_price_id === priceId);
      const staticPlan = Object.values(PLANS).find(p => p.stripePriceId === priceId);
      const planId    = dbPlan?.plan_id ?? staticPlan?.id;
      if (!planId) break;
      const plan = await getPlanById(planId);

      const { data: wsForLog } = await db
        .from("workspaces")
        .select("id, name, plan_id")
        .eq("stripe_customer_id", sub.customer as string)
        .maybeSingle();

      await db
        .from("workspaces")
        .update({
          plan_id:                plan.plan_id,
          plan_status:            sub.status as string,
          stripe_sub_id:          sub.id,
          trial_ends_at:          null,
          subscription_renews_at: new Date(((sub as unknown as Record<string, number>).current_period_end ?? (Date.now() / 1000 + 30 * 86400)) * 1000).toISOString(),
          max_inboxes:            plan.max_inboxes,
          max_monthly_sends:      plan.max_monthly_sends,
          max_seats:              plan.max_seats,
          updated_at:             new Date().toISOString(),
        })
        .eq("stripe_customer_id", sub.customer as string);

      if (wsForLog) {
        const isUpgrade = wsForLog.plan_id && wsForLog.plan_id !== "free" && wsForLog.plan_id !== plan.plan_id;
        const isNew     = !wsForLog.plan_id || wsForLog.plan_id === "free";
        await logActivity({
          workspace_id:   wsForLog.id,
          workspace_name: wsForLog.name,
          type:           isNew ? "subscription_started" : isUpgrade ? "subscription_upgraded" : "subscription_started",
          title:          `${isNew ? "Subscribed to" : "Plan changed to"} ${plan.name}`,
          description:    `${wsForLog.name} — ${plan.name} via Stripe`,
          metadata:       { plan_id: plan.plan_id, stripe_sub_id: sub.id },
        });
      }
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

      // Send renewal receipt on recurring invoices
      if (isRenewal) {
        const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { email: userEmail, name: wsName } = await resolveStripeEmail(db, inv.customer as string);
        if (userEmail) {
          sendSubscriptionRenewalSuccessEmail({
            userEmail,
            workspaceName: wsName ?? ws.id,
            planName:      planConfig.name,
            amountNgn:     Math.round(((inv as unknown as Record<string, number>).amount_paid ?? 0) / 100),
            renewsAt,
          }).catch(e => console.error("[billing] stripe renewal email failed:", e));
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { data: wsCancel } = await db
        .from("workspaces")
        .select("id, name, plan_id")
        .eq("stripe_customer_id", sub.customer as string)
        .maybeSingle();

      if (wsCancel) {
        // Clear Stripe-specific fields first, then use shared downgrade helper
        // (pauses campaigns, expires subscription credits, resets plan limits)
        await db.from("workspaces").update({
          stripe_sub_id:          null,
          subscription_renews_at: null,
        }).eq("id", wsCancel.id);

        await downgradeWorkspaceToFree(db, wsCancel.id, "subscription_cancelled");

        await logActivity({
          workspace_id:   wsCancel.id,
          workspace_name: wsCancel.name,
          type:           "subscription_cancelled",
          title:          "Subscription cancelled",
          description:    `${wsCancel.name} cancelled — downgraded to Free (Stripe)`,
          metadata:       { stripe_sub_id: sub.id },
        });

        // Notify user their account has been downgraded
        const { email: userEmail } = await resolveStripeEmail(db, sub.customer as string);
        if (userEmail) {
          sendDowngradeNotification({
            userEmail,
            workspaceName: wsCancel.name ?? wsCancel.id,
            reason: "subscription_cancelled",
          }).catch(e => console.error("[billing] stripe cancellation email failed:", e));
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
