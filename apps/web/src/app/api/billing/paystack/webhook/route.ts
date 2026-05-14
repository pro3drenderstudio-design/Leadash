import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackSignature, verifyPaystackPayment, disablePaystackSubscription } from "@/lib/billing/paystack";
import { logActivity } from "@/lib/activity";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { enqueueProvision } from "@/lib/queue";
import { getPoolQuotaStatus, pauseCampaignsForPoolOverage } from "@/lib/billing/pool-quota";
import { downgradeWorkspaceToFree } from "@/lib/billing/downgrade";
import { getDedicatedIpPrice } from "@/lib/billing/dedicatedIpPrice";

export async function POST(req: NextRequest) {
  const rawBody   = await req.text();
  const signature = req.headers.get("x-paystack-signature") ?? "";

  if (!verifyPaystackSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: {
    event: string;
    data: Record<string, unknown>;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = createAdminClient();

  // ── Plan subscription: charge.success ────────────────────────────────────────
  if (event.event === "charge.success") {
    const data       = event.data as { reference: string; metadata?: Record<string, unknown>; authorization?: { authorization_code?: string; customer_code?: string } };
    const meta       = data.metadata ?? {};
    const type       = meta.type as string | undefined;
    const workspaceId = meta.workspace_id as string | undefined;

    // Dedicated IP add-on
    if (type === "dedicated_ip" && workspaceId) {
      const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(data.reference);
      if (paid) {
        // Idempotency — verify route may have already created the record
        const { data: existingInvoice } = await db
          .from("billing_invoices")
          .select("id")
          .eq("paystack_reference", data.reference)
          .maybeSingle();

        if (!existingInvoice) {
          const amountKobo = (data as Record<string, unknown>).amount as number | undefined;
          const { priceNgn: ipPriceNgn } = await getDedicatedIpPrice();
          await db.from("dedicated_ip_subscriptions").insert({
            workspace_id:           workspaceId,
            status:                 "pending",
            price_ngn:              ipPriceNgn,
            ...(authorizationCode ? { paystack_auth_code:     authorizationCode } : {}),
            ...(customerCode      ? { paystack_customer_code: customerCode }      : {}),
          });
          await db.from("billing_invoices").insert({
            workspace_id:       workspaceId,
            type:               "dedicated_ip",
            description:        "Dedicated IP add-on",
            amount_kobo:        amountKobo ?? (ipPriceNgn * 100),
            paystack_reference: data.reference,
            status:             "paid",
          });
        }
      }
      return NextResponse.json({ received: true });
    }

    // Credit pack purchase
    if (type === "credit_purchase" && workspaceId) {
      const packId  = meta.pack_id  as string | undefined;
      const credits = meta.credits  as string | undefined;
      const amountKobo = meta.amount_kobo as number | undefined;
      if (packId && credits) {
        // Idempotency — skip if this reference was already processed
        const { data: existingInvoice } = await db
          .from("billing_invoices")
          .select("id")
          .eq("paystack_reference", data.reference)
          .maybeSingle();
        if (!existingInvoice) {
          const { paid } = await verifyPaystackPayment(data.reference);
          if (paid) {
            const creditsNum = parseInt(credits, 10);
            if (!isNaN(creditsNum) && creditsNum > 0) {
              // Insert transaction first (unique on paystack_reference prevents double-grant)
              const { error: txErr } = await db.from("lead_credit_transactions").insert({
                workspace_id:       workspaceId,
                type:               "purchase",
                amount:             creditsNum,
                description:        `Credit pack: ${packId}`,
                paystack_reference: data.reference,
              });
              if (!txErr) {
                const { data: ws } = await db.from("workspaces")
                  .select("lead_credits_balance").eq("id", workspaceId).single();
                if (ws) {
                  await db.from("workspaces")
                    .update({ lead_credits_balance: (ws.lead_credits_balance ?? 0) + creditsNum })
                    .eq("id", workspaceId);
                }
                await db.from("billing_invoices").insert({
                  workspace_id:       workspaceId,
                  type:               "credit_purchase",
                  description:        `${creditsNum.toLocaleString()} lead credits`,
                  amount_kobo:        amountKobo ?? 0,
                  paystack_reference: data.reference,
                  status:             "paid",
                });
              }
            }
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // Plan subscription payment
    if (type === "plan_subscription" && workspaceId) {
      const planId = meta.plan_id as string | undefined;
      const amountKobo = (data as Record<string, unknown>).amount as number | undefined;
      // Subscription code may be present on recurring charge.success events
      const chargeSubCode = (data as Record<string, unknown>).subscription_code as string | undefined;
      if (planId) {
        // Idempotency — skip if this reference was already processed
        const { data: existingPlanInvoice } = await db
          .from("billing_invoices")
          .select("id")
          .eq("paystack_reference", data.reference)
          .maybeSingle();
        if (existingPlanInvoice) return NextResponse.json({ received: true });

        const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(data.reference);
        if (paid) {
          const plan = await getPlanById(planId);
          const subRenewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await db
            .from("workspaces")
            .update({
              plan_id:                 plan.plan_id,
              plan_status:             "active",
              trial_ends_at:           null,
              subscription_renews_at:  subRenewsAt,
              max_inboxes:             plan.max_inboxes,
              max_monthly_sends:       plan.max_monthly_sends,
              max_seats:               plan.max_seats,
              ...(authorizationCode ? { paystack_auth_code:      authorizationCode } : {}),
              ...(customerCode      ? { paystack_customer_code:  customerCode }      : {}),
              ...(chargeSubCode     ? { paystack_sub_code:       chargeSubCode }     : {}),
              updated_at:              new Date().toISOString(),
            })
            .eq("id", workspaceId);
          // Record invoice
          await db.from("billing_invoices").insert({
            workspace_id:       workspaceId,
            type:               "plan_subscription",
            description:        `${plan.name} plan subscription`,
            amount_kobo:        amountKobo ?? (plan.price_ngn * 100),
            paystack_reference: data.reference,
            status:             "paid",
          });

          // Log subscription activity
          const { data: wsName } = await db.from("workspaces").select("name").eq("id", workspaceId).single();
          await logActivity({
            workspace_id:   workspaceId,
            workspace_name: wsName?.name,
            type:           "subscription_started",
            title:          `Subscribed to ${plan.name}`,
            description:    `${wsName?.name ?? workspaceId} — ${plan.name} via Paystack`,
            metadata:       { plan_id: planId, reference: data.reference },
          });

          // Check for pool overage after plan change — pause active campaigns if over limit
          void (async () => {
            const quota = await getPoolQuotaStatus(db, workspaceId);
            if (quota.isOver) {
              const paused = await pauseCampaignsForPoolOverage(db, workspaceId);
              console.warn(
                `[billing] Pool overage on plan change: workspace=${workspaceId} ` +
                `plan=${planId} pool_max=${quota.max} pool_used=${quota.used} overage=${quota.overage} ` +
                `campaigns_paused=${paused}`,
              );
            }
          })().catch(() => {});

          // Grant included monthly credits — guarded by billing_invoices unique reference.
          // The invoice was just inserted above; tie credit grant to the same reference.
          if (plan.included_credits > 0) {
            const grantRef = `grant:${data.reference}`;
            const { error: grantTxErr } = await db.from("lead_credit_transactions").insert({
              workspace_id:       workspaceId,
              type:               "grant",
              amount:             plan.included_credits,
              description:        `Monthly credits — ${plan.name} plan`,
              paystack_reference: grantRef,
            });
            // txErr = duplicate unique key → grant already done (verify route ran first)
            if (!grantTxErr) {
              const { data: ws } = await db
                .from("workspaces")
                .select("lead_credits_balance, subscription_credits_balance")
                .eq("id", workspaceId)
                .single();
              if (ws) {
                await db.from("workspaces")
                  .update({
                    lead_credits_balance:         (ws.lead_credits_balance ?? 0) + plan.included_credits,
                    subscription_credits_balance: plan.included_credits,
                  })
                  .eq("id", workspaceId);
              }
            }
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // Academy enrollment
    if (type === "academy_enrollment" && workspaceId) {
      const productId  = meta.product_id as string | undefined;
      const cohortId   = meta.cohort_id  as string | undefined;
      const userId     = meta.user_id    as string | undefined;
      const phone      = meta.phone      as string | undefined;
      const amountKobo = (data as Record<string, unknown>).amount as number | undefined;

      if (productId && userId) {
        const { paid } = await verifyPaystackPayment(data.reference);
        if (paid) {
          const { data: existing } = await db
            .from("academy_enrollments")
            .select("id")
            .eq("paystack_reference", data.reference)
            .maybeSingle();

          if (!existing) {
            const { data: product } = await db
              .from("academy_products")
              .select("credits_grant, leadash_months, name")
              .eq("id", productId)
              .single();

            if (product) {
              const leadashAccessEndsAt = product.leadash_months
                ? new Date(Date.now() + product.leadash_months * 30 * 24 * 60 * 60 * 1000).toISOString()
                : null;

              const { data: enrollment } = await db.from("academy_enrollments").insert({
                user_id:               userId,
                workspace_id:          workspaceId,
                product_id:            productId,
                cohort_id:             cohortId ?? null,
                status:                "active",
                paystack_reference:    data.reference,
                amount_kobo:           amountKobo ?? null,
                phone:                 phone ?? null,
                credits_granted:       false,
                leadash_access_ends_at: leadashAccessEndsAt,
              }).select("id").single();

              if (enrollment && product.credits_grant > 0) {
                const { data: ws } = await db.from("workspaces").select("lead_credits_balance").eq("id", workspaceId).single();
                if (ws) {
                  await db.from("workspaces").update({ lead_credits_balance: (ws.lead_credits_balance ?? 0) + product.credits_grant }).eq("id", workspaceId);
                  await db.from("lead_credit_transactions").insert({
                    workspace_id: workspaceId,
                    type: "grant",
                    amount: product.credits_grant,
                    description: `Academy enrollment — ${product.name}`,
                    paystack_reference: data.reference,
                  });
                  await db.from("academy_enrollments").update({ credits_granted: true }).eq("id", enrollment.id);
                }
              }

              await db.from("billing_invoices").insert({
                workspace_id:       workspaceId,
                type:               "academy_enrollment",
                description:        `Academy — ${product.name}`,
                amount_kobo:        amountKobo ?? 0,
                paystack_reference: data.reference,
                status:             "paid",
              }).then(() => {}).catch(() => {});
            }
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // Domain purchase payment
    const domainRecordId = meta.domain_record_id as string | undefined;
    if (!domainRecordId || !workspaceId) {
      return NextResponse.json({ received: true });
    }

    const { data: domainRecord } = await db
      .from("outreach_domains")
      .select("*")
      .eq("id", domainRecordId)
      .single();

    if (!domainRecord || domainRecord.status === "active") {
      return NextResponse.json({ received: true });
    }

    const { data: billingWs } = await db
      .from("workspaces")
      .select("billing_email")
      .eq("id", workspaceId)
      .single();

    const { paid, authorizationCode } = await verifyPaystackPayment(data.reference);
    if (!paid) return NextResponse.json({ received: true });

    // Store authorization code + billing metadata for monthly recurring charges
    if (authorizationCode) {
      const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .from("outreach_domains")
        .update({
          paystack_auth_code:      authorizationCode,
          paystack_billing_email:  billingWs?.billing_email ?? null,
          inbox_next_billing_date: nextBillingDate,
        })
        .eq("id", domainRecordId);
    }

    // Enqueue domain provisioning on the VPS worker — avoids Vercel 10s timeout
    await enqueueProvision(domainRecordId, workspaceId);

    return NextResponse.json({ received: true });
  }

  // ── Subscription created — store subscription code ───────────────────────────
  if (event.event === "subscription.create") {
    const data = event.data as {
      subscription_code?: string;
      customer?: { customer_code?: string; metadata?: { workspace_id?: string } };
    };
    const subCode = data.subscription_code;
    if (subCode) {
      // Paystack does not echo transaction metadata here — workspace_id won't be in
      // customer.metadata unless the customer was created with it. Use customer_code
      // (stored on workspace during charge.success) as the reliable lookup key.
      const fromMeta     = data.customer?.metadata?.workspace_id;
      const customerCode = data.customer?.customer_code;
      if (fromMeta) {
        await db.from("workspaces").update({ paystack_sub_code: subCode }).eq("id", fromMeta);
      } else if (customerCode) {
        await db.from("workspaces").update({ paystack_sub_code: subCode }).eq("paystack_customer_code", customerCode);
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Recurring billing cycle — grant monthly credits ─────────────────────────────
  if (event.event === "invoice.update") {
    const inv = event.data as {
      status?: string;
      subscription?: { subscription_code?: string; plan?: { plan_code?: string } };
    };
    // Only act on paid invoices for active subscriptions
    if (inv.status === "success" && inv.subscription?.subscription_code) {
      const subCode = inv.subscription.subscription_code;

      // Find the workspace tied to this subscription
      const { data: ws } = await db
        .from("workspaces")
        .select("id, plan_id, lead_credits_balance, subscription_credits_balance")
        .eq("paystack_sub_code", subCode)
        .maybeSingle();

      if (ws) {
        const plan = await getPlanById(ws.plan_id ?? "free");
        const nextRenewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await db.from("workspaces")
          .update({ subscription_renews_at: nextRenewsAt })
          .eq("id", ws.id);
        if (plan.included_credits > 0) {
          const currentSub   = ws.subscription_credits_balance ?? 0;
          const currentTotal = ws.lead_credits_balance ?? 0;
          // Renewal: expire unused subscription credits, grant new allocation
          const newTotal = currentTotal - currentSub + plan.included_credits;
          await db.from("workspaces")
            .update({
              lead_credits_balance:         Math.max(0, newTotal),
              subscription_credits_balance: plan.included_credits,
            })
            .eq("id", ws.id);
          await db.from("lead_credit_transactions").insert({
            workspace_id: ws.id,
            type:         "grant",
            amount:       plan.included_credits,
            description:  `Monthly credits — ${plan.name} plan renewal`,
          });
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Payment failed — enter 3-day grace period ────────────────────────────────
  if (event.event === "invoice.payment_failed") {
    const data = event.data as { subscription_code?: string };
    const subCode = data.subscription_code;
    if (subCode) {
      const graceEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: ws } = await db
        .from("workspaces")
        .update({
          plan_status:  "past_due",
          grace_ends_at: graceEndsAt,
          updated_at:   new Date().toISOString(),
        })
        .eq("paystack_sub_code", subCode)
        .select("id")
        .maybeSingle();

      // Pause active campaigns immediately — restored if payment comes through
      if (ws?.id) {
        const paused = await pauseCampaignsForPoolOverage(db, ws.id);
        console.warn(`[billing] Payment failed: workspace=${ws.id} grace_ends_at=${graceEndsAt} campaigns_paused=${paused}`);
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Subscription fully disabled — immediate downgrade (Paystack exhausted retries) ──
  if (event.event === "subscription.disable") {
    const data = event.data as { subscription_code?: string };
    const subCode = data.subscription_code;
    if (subCode) {
      const { data: ws } = await db
        .from("workspaces")
        .select("id")
        .eq("paystack_sub_code", subCode)
        .maybeSingle();

      if (ws?.id) {
        await db.from("workspaces").update({ subscription_renews_at: null }).eq("id", ws.id);
        const { paused, creditsExpired } = await downgradeWorkspaceToFree(db, ws.id, "subscription_disabled");
        console.warn(`[billing] Subscription disabled: workspace=${ws.id} campaigns_paused=${paused} credits_expired=${creditsExpired}`);
        const { data: wsName } = await db.from("workspaces").select("name").eq("id", ws.id).single();
        await logActivity({
          workspace_id:   ws.id,
          workspace_name: wsName?.name,
          type:           "subscription_cancelled",
          title:          "Subscription cancelled",
          description:    `${wsName?.name ?? ws.id} — downgraded to Free (Paystack)`,
          metadata:       { subscription_code: subCode },
        });
      }
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
