import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackSignature, verifyPaystackPayment, disablePaystackSubscription } from "@/lib/billing/paystack";
import { logActivity } from "@/lib/activity";
import { getPlanById } from "@/lib/billing/getActivePlans";
import { enqueueProvision } from "@/lib/queue";
import { getPoolQuotaStatus, pauseCampaignsForPoolOverage } from "@/lib/billing/pool-quota";
import { downgradeWorkspaceToFree } from "@/lib/billing/downgrade";
import { getDedicatedIpPrice } from "@/lib/billing/dedicatedIpPrice";
import {
  sendSubscriptionRenewalSuccessEmail,
  sendGracePeriodWarning,
  sendDowngradeNotification,
  sendDomainProvisioningStartedEmail,
  sendBundleRenewedEmail,
  sendBundlePaymentFailedEmail,
} from "@/lib/email/notifications";
import { enqueueAutomation } from "@/lib/queue/client";

async function resolveWorkspaceEmail(
  db: ReturnType<typeof createAdminClient>,
  workspaceId: string,
): Promise<{ email: string | null; name: string | null; billingEmail: string | null }> {
  const { data: ws } = await db
    .from("workspaces")
    .select("name, billing_email, workspace_members(user_id)")
    .eq("id", workspaceId)
    .single();
  if (!ws) return { email: null, name: null, billingEmail: null };
  if (ws.billing_email) return { email: ws.billing_email, name: ws.name, billingEmail: ws.billing_email };
  const userId = (ws as unknown as { workspace_members: Array<{ user_id: string }> }).workspace_members?.[0]?.user_id;
  if (!userId) return { email: null, name: ws.name, billingEmail: null };
  try {
    const { data: { user } } = await db.auth.admin.getUserById(userId);
    return { email: user?.email ?? null, name: ws.name, billingEmail: null };
  } catch { return { email: null, name: ws.name, billingEmail: null }; }
}

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

    // Inbox domain billing (recurring charge from cron or retry)
    if ((type === "inbox_renewal" || type === "inbox_renewal_retry") && workspaceId) {
      const domainId   = meta.domain_id as string | undefined;
      const amountKobo = (data as Record<string, unknown>).amount as number | undefined;
      if (domainId) {
        const { data: dom } = await db
          .from("outreach_domains")
          .select("domain")
          .eq("id", domainId)
          .maybeSingle();
        // Record invoice — upsert so the cron's direct insert is not duplicated
        await db.from("billing_invoices").upsert({
          workspace_id:       workspaceId,
          type:               "inbox_billing",
          description:        `Inbox domain — ${dom?.domain ?? domainId}`,
          amount_kobo:        amountKobo ?? 0,
          paystack_reference: data.reference,
          status:             "paid",
        }, { onConflict: "paystack_reference", ignoreDuplicates: true });
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

    // ── Annual bundle subscription (funnel) ──────────────────────────────────
    if (type === "bundle_subscription" && workspaceId) {
      const userId          = meta.user_id               as string | undefined;
      const durationMonths  = parseInt(String(meta.bundle_duration_months ?? "12"), 10);
      const existingSubCode = meta.existing_sub_code     as string | null | undefined;
      const amountKobo      = (data as Record<string, unknown>).amount as number | undefined;

      if (userId) {
        const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(data.reference);
        if (paid) {
          // Idempotency
          const { data: existingInvoice } = await db
            .from("billing_invoices")
            .select("id")
            .eq("paystack_reference", data.reference)
            .maybeSingle();

          if (!existingInvoice) {
            const purchasedAt  = new Date().toISOString();
            const expiresAt    = new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000).toISOString();

            // Cancel existing monthly subscription if present
            if (existingSubCode) {
              // Paystack needs the email_token to disable — look it up or skip gracefully
              // We store auth code and sub code on the workspace; Paystack disables on their end
              // via the subscription.disable event. Here we just mark as upgrading.
              console.log(`[paystack] bundle upgrade: cancelling existing sub=${existingSubCode} for workspace=${workspaceId}`);
              // Disable via Paystack API — we need the email token which we don't store.
              // The subscription.disable webhook will fire when Paystack confirms.
              // For now, mark the workspace so cron doesn't charge the old sub.
              await db.from("workspaces")
                .update({ plan_status: "bundle_upgrading" })
                .eq("id", workspaceId)
                .eq("paystack_sub_code", existingSubCode);
            }

            // Load bundle settings
            const { data: bundleSettings } = await db
              .from("admin_settings")
              .select("key, value")
              .in("key", ["funnel_bundle_inbox_count", "funnel_mizark_invite_link"]);
            const bsMap = Object.fromEntries((bundleSettings ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value as string]));
            const inboxCredits = parseInt(bsMap["funnel_bundle_inbox_count"] ?? "20", 10);
            const mizarkLink   = bsMap["funnel_mizark_invite_link"] ?? null;

            // Update workspace — mark as bundle subscriber
            await db.from("workspaces").update({
              bundle_expires_at:       expiresAt,
              ...(authorizationCode ? { paystack_auth_code:     authorizationCode } : {}),
              ...(customerCode      ? { paystack_customer_code: customerCode }      : {}),
              updated_at:              purchasedAt,
            }).eq("id", workspaceId);

            // Grant inbox entitlements
            await db.from("workspace_entitlements").insert({
              workspace_id:    workspaceId,
              entitlement_type: "inbox_credit",
              quantity:         inboxCredits,
              expires_at:       expiresAt,
              source:           "bundle_subscription",
              is_active:        true,
            });

            // Update funnel_state
            await db.from("funnel_states").upsert({
              user_id:             userId,
              upsell_purchased_at: purchasedAt,
              current_offer:       "bundle",
            }, { onConflict: "user_id" });

            // Record invoice
            await db.from("billing_invoices").insert({
              workspace_id:       workspaceId,
              type:               "bundle_subscription",
              description:        "Leadash × Learn By Mizark Annual Bundle",
              amount_kobo:        amountKobo ?? 0,
              paystack_reference: data.reference,
              status:             "paid",
            }).catch(() => {});

            // Fire automation
            await enqueueAutomation({
              event:        "user.bundle_purchased",
              workspace_id: workspaceId,
              user_id:      userId,
              payload: {
                purchased_at:   purchasedAt,
                expires_at:     expiresAt,
                inbox_credits:  inboxCredits,
                mizark_link:    mizarkLink,
                amount_ngn:     Math.round((amountKobo ?? 0) / 100),
              },
            }).catch(e => console.error("[paystack] bundle automation enqueue:", e));
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // ── 30-Day Challenge enrollment (funnel) ─────────────────────────────────
    if (type === "challenge_30_enrollment" && workspaceId) {
      const userId     = meta.user_id   as string | undefined;
      const productId  = meta.product_id as string | undefined;
      const amountKobo = (data as Record<string, unknown>).amount as number | undefined;

      if (userId && productId) {
        const { paid } = await verifyPaystackPayment(data.reference);
        if (paid) {
          // Idempotency guard
          const { data: existingEnroll } = await db
            .from("academy_enrollments")
            .select("id")
            .eq("paystack_reference", data.reference)
            .maybeSingle();

          if (!existingEnroll) {
            const enrolledAt = new Date().toISOString();
            const offerExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            // Create academy enrollment
            await db.from("academy_enrollments").insert({
              user_id:            userId,
              workspace_id:       workspaceId,
              product_id:         productId,
              status:             "active",
              paystack_reference: data.reference,
              amount_kobo:        amountKobo ?? null,
              credits_granted:    false,
            });

            // Update funnel_state — set 30-day timer origin
            await db.from("funnel_states").upsert({
              user_id:                userId,
              challenge_enrolled_at:  enrolledAt,
              bundle_offer_expires_at: offerExpires,
              current_offer:          "challenge",
            }, { onConflict: "user_id" });

            // Record invoice
            await db.from("billing_invoices").insert({
              workspace_id:       workspaceId,
              type:               "academy_enrollment",
              description:        "30-Day Outreach Challenge",
              amount_kobo:        amountKobo ?? 0,
              paystack_reference: data.reference,
              status:             "paid",
            }).catch(() => {});

            // Fire automation
            await enqueueAutomation({
              event:        "user.challenge_enrolled",
              workspace_id: workspaceId,
              user_id:      userId,
              payload: {
                product_id:              productId,
                enrolled_at:             enrolledAt,
                bundle_offer_expires_at: offerExpires,
                amount_ngn:              Math.round((amountKobo ?? 0) / 100),
              },
            }).catch(e => console.error("[paystack] challenge automation enqueue:", e));
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

    // ── Offer purchase (Offer Builder) ───────────────────────────────────────
    if (type === "offer_purchase") {
      const purchaseId = meta.purchase_id as string | undefined;
      if (purchaseId) {
        const { data: purchase } = await db.from("offer_purchases").select("*").eq("id", purchaseId).maybeSingle();
        if (purchase && purchase.status === "pending") {
          const { paid, authorizationCode, customerCode } = await verifyPaystackPayment(data.reference);
          if (paid) {
            const { data: offer } = await db.from("offers").select("*").eq("id", purchase.offer_id).maybeSingle();
            if (offer) {
              const { fulfillAllGrants, fulfillGrant } = await import("@/lib/offers/granters");
              const { sendOfferSaleAdminNotification, sendOfferPurchaseReceiptEmail } = await import("@/lib/email/notifications");

              // Compute next_renewal_at for recurring offers.
              const INTERVAL_DAYS: Record<string, number> = { monthly: 30, quarterly: 91, annual: 365 };
              const isRecurring = offer.pricing_model === "recurring";
              const renewalDays = isRecurring ? (INTERVAL_DAYS[offer.billing_interval ?? "monthly"] ?? 30) : null;
              const nextRenewalAt = renewalDays ? new Date(Date.now() + renewalDays * 24 * 60 * 60 * 1000).toISOString() : null;

              type OfferGrantLite = { id: string; type: string };
              const baseGrants = (offer.grants ?? []) as OfferGrantLite[];

              // Respect manual_approval and auto_grant flags.
              const needsManualApproval = offer.manual_approval || !offer.auto_grant;

              let grantedItems: Array<{ grant_id: string; type: string; status: string; detail?: string }>;
              if (needsManualApproval) {
                grantedItems = baseGrants.map((g) => ({
                  grant_id: g.id, type: g.type, status: "pending_manual" as const,
                  detail: "Awaiting admin approval",
                }));
              } else if (purchase.workspace_id && purchase.user_id) {
                grantedItems = await fulfillAllGrants(db, offer.grants, {
                  workspaceId: purchase.workspace_id,
                  userId:      purchase.user_id,
                  offerName:   offer.name,
                  reference:   data.reference,
                });

                // Fulfill any order bumps the buyer added.
                const lineItems = (purchase.line_items ?? []) as { kind: string; label: string; amount_ngn: number }[];
                type OfferBumpLite = { id: string; label: string; is_active: boolean; grant: OfferGrantLite };
                const bumps = (offer.bumps ?? []) as OfferBumpLite[];
                for (const li of lineItems) {
                  if (li.kind !== "bump") continue;
                  const bump = bumps.find(b => b.label === li.label);
                  if (!bump) continue;
                  const item = await fulfillGrant(db, bump.grant as never, {
                    workspaceId: purchase.workspace_id,
                    userId:      purchase.user_id,
                    offerName:   offer.name,
                    reference:   data.reference,
                  });
                  grantedItems.push(item);
                }
              } else {
                grantedItems = baseGrants.map((g) => ({
                  grant_id: g.id, type: g.type, status: "pending_manual" as const,
                  detail: "No workspace on purchase",
                }));
              }

              await db.from("offer_purchases").update({
                status:                 "paid",
                granted_at:             new Date().toISOString(),
                granted_items:          grantedItems,
                paystack_reference:     data.reference,
                authorization_code:     authorizationCode ?? null,
                paystack_customer_code: customerCode ?? null,
                next_renewal_at:        nextRenewalAt,
                manual_approval_status: needsManualApproval ? "pending" : null,
              }).eq("id", purchaseId);

              // Increment discount code redemption count.
              if (purchase.discount_code_id) {
                const { data: dc } = await db
                  .from("offer_discount_codes")
                  .select("redemptions")
                  .eq("id", purchase.discount_code_id)
                  .maybeSingle();
                if (dc) {
                  await db.from("offer_discount_codes")
                    .update({ redemptions: dc.redemptions + 1 })
                    .eq("id", purchase.discount_code_id);
                }
              }

              // Notifications per offer settings.
              if (offer.notify_admin) {
                sendOfferSaleAdminNotification({
                  offerName:  offer.name,
                  offerId:    offer.id,
                  buyerEmail: purchase.buyer_email ?? "unknown",
                  buyerName:  purchase.buyer_name ?? null,
                  totalNgn:   purchase.total_ngn,
                  currency:   purchase.currency,
                }).catch(e => console.error("[paystack] offer admin notify failed:", e));
              }
              if (offer.send_receipt && purchase.buyer_email) {
                sendOfferPurchaseReceiptEmail({
                  buyerEmail: purchase.buyer_email,
                  buyerName:  purchase.buyer_name ?? null,
                  offerName:  offer.name,
                  lineItems:  (purchase.line_items ?? []) as { label: string; amount_ngn: number }[],
                  totalNgn:   purchase.total_ngn,
                }).catch(e => console.error("[paystack] offer receipt email failed:", e));
              }
              if (purchase.workspace_id && purchase.user_id) {
                enqueueAutomation({
                  event:        "user.offer_purchased",
                  workspace_id: purchase.workspace_id,
                  user_id:      purchase.user_id,
                  payload: {
                    offer_id:      offer.id,
                    offer_name:    offer.name,
                    line_items:    purchase.line_items,
                    total_ngn:     purchase.total_ngn,
                    send_whatsapp: offer.send_whatsapp,
                  },
                }).catch(e => console.error("[paystack] offer automation enqueue failed:", e));
                enqueueAutomation({
                  event:        "offers.purchase_created",
                  workspace_id: purchase.workspace_id,
                  user_id:      purchase.user_id,
                  payload: {
                    offer_id:    offer.id,
                    offer_name:  offer.name,
                    total_ngn:   purchase.total_ngn,
                    purchase_id: purchase.id,
                  },
                }).catch(e => console.error("[paystack] offers.purchase_created enqueue failed:", e));
              }
            }
          }
        }
      }
      return NextResponse.json({ received: true });
    }

    // ── Affiliate commission (runs after offer_purchase and plan_subscription blocks above) ──
    if ((type === "offer_purchase" || type === "plan_subscription") && workspaceId) {
      void (async () => {
        try {
          const { data: ws } = await db
            .from("workspaces")
            .select("referred_by_affiliate_id")
            .eq("id", workspaceId)
            .single();

          if (!ws?.referred_by_affiliate_id) return;

          const affiliateId = ws.referred_by_affiliate_id;
          const { data: affiliate } = await db
            .from("affiliates")
            .select("id, tier, paid_referrals")
            .eq("id", affiliateId)
            .single();
          if (!affiliate) return;

          // Look up referral record
          const { data: referral } = await db
            .from("referrals")
            .select("id, status")
            .eq("affiliate_id", affiliateId)
            .eq("referred_workspace_id", workspaceId)
            .maybeSingle();
          if (!referral) return;

          const TIER_RATES: Record<string, number> = { bronze: 0.20, silver: 0.25, gold: 0.30 };
          const rate = TIER_RATES[affiliate.tier] ?? 0.20;
          const amountKobo = (event.data as Record<string, unknown>).amount as number | undefined;
          const amountNgn = Math.round((amountKobo ?? 0) / 100);
          if (amountNgn <= 0) return;

          const commissionNgn = Math.round(amountNgn * rate * 100) / 100;
          const isFirstPayment = referral.status === "lead";
          const kind = isFirstPayment ? "bounty" : "recurring";

          // 45-day hold
          const holdsUntil = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();

          // Idempotent insert (unique on source_payment_ref + kind)
          await db.from("commission_events").insert({
            affiliate_id:       affiliateId,
            referral_id:        referral.id,
            kind,
            amount_ngn:         kind === "bounty" ? 5000 : commissionNgn,
            source_payment_ref: data.reference,
            holds_until:        holdsUntil,
            status:             "pending",
          });

          // Update referral status and affiliate paid_referrals count
          if (isFirstPayment) {
            await db.from("referrals").update({ status: "paid", first_paid_at: new Date().toISOString() }).eq("id", referral.id);

            const newPaidCount = (affiliate.paid_referrals ?? 0) + 1;
            let newTier = affiliate.tier;
            if (newPaidCount >= 25) newTier = "gold";
            else if (newPaidCount >= 10) newTier = "silver";

            await db.from("affiliates").update({ paid_referrals: newPaidCount, tier: newTier }).eq("id", affiliateId);
          }
        } catch (e) {
          console.error("[affiliates] commission error:", e);
        }
      })();
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

    const { paid, authorizationCode, customerEmail } = await verifyPaystackPayment(data.reference);
    if (!paid) return NextResponse.json({ received: true });

    // Resolve workspace email for sending the confirmation email
    const { email: resolvedBillingEmail } = await resolveWorkspaceEmail(db, workspaceId);

    // Store authorization code + billing metadata for monthly recurring charges
    // Use the actual Paystack customer email (tied to the auth code) for future charges
    if (authorizationCode) {
      const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db
        .from("outreach_domains")
        .update({
          paystack_auth_code:      authorizationCode,
          paystack_billing_email:  customerEmail ?? resolvedBillingEmail ?? null,
          inbox_next_billing_date: nextBillingDate,
        })
        .eq("id", domainRecordId);
    }

    // Enqueue domain provisioning on the VPS worker — avoids Vercel 10s timeout
    await enqueueProvision(domainRecordId, workspaceId);

    // Confirm purchase to user
    const notifyEmail = customerEmail ?? resolvedBillingEmail;
    if (notifyEmail) {
      sendDomainProvisioningStartedEmail({
        userEmail:    notifyEmail,
        domain:       domainRecord.domain,
        mailboxCount: (domainRecord.mailbox_count as number | null) ?? 1,
      }).catch((e: unknown) => console.error("[billing] domain provision email failed:", e));
    }

    return NextResponse.json({ received: true });
  }

  // ── Subscription created — store subscription code ───────────────────────────
  if (event.event === "subscription.create") {
    const data = event.data as {
      subscription_code?: string;
      plan?:              { plan_code?: string };
      customer?: { customer_code?: string; metadata?: { workspace_id?: string } };
      authorization?: { authorization_code?: string };
    };
    const subCode      = data.subscription_code;
    const authCode     = data.authorization?.authorization_code;
    const fromMeta     = data.customer?.metadata?.workspace_id;
    const customerCode = data.customer?.customer_code;
    const planCode     = data.plan?.plan_code;

    if (subCode) {
      // Determine if this is a bundle plan subscription
      const { data: bundleSetting } = await db
        .from("admin_settings").select("value").eq("key", "funnel_bundle_paystack_plan_code").maybeSingle();
      const bundlePlanCode = bundleSetting?.value as string | undefined;
      const isBundle = bundlePlanCode && planCode === bundlePlanCode;

      if (isBundle && fromMeta) {
        // Store bundle sub code separately from main plan sub code
        await db.from("workspaces")
          .update({ bundle_paystack_sub_code: subCode })
          .eq("id", fromMeta);
      } else if (isBundle && customerCode) {
        await db.from("workspaces")
          .update({ bundle_paystack_sub_code: subCode })
          .eq("paystack_customer_code", customerCode)
          .not("bundle_expires_at", "is", null)
          .is("bundle_paystack_sub_code", null);
      } else {
        // Main Leadash plan — try each identifier in order, stopping at the first match.
        // Lookups 1 & 2 depend on charge.success having already run; lookup 3
        // (auth_code) works even if the events arrive out of order.
        if (fromMeta) {
          await db.from("workspaces")
            .update({ paystack_sub_code: subCode })
            .eq("id", fromMeta);
        } else if (customerCode) {
          const { data: matched } = await db.from("workspaces")
            .update({ paystack_sub_code: subCode })
            .eq("paystack_customer_code", customerCode)
            .is("paystack_sub_code", null)
            .select("id")
            .maybeSingle();
          if (!matched && authCode) {
            await db.from("workspaces")
              .update({ paystack_sub_code: subCode })
              .eq("paystack_auth_code", authCode)
              .is("paystack_sub_code", null);
          }
        } else if (authCode) {
          await db.from("workspaces")
            .update({ paystack_sub_code: subCode })
            .eq("paystack_auth_code", authCode)
            .is("paystack_sub_code", null);
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Recurring billing cycle — grant monthly credits ─────────────────────────────
  if (event.event === "invoice.update") {
    const inv = event.data as {
      status?: string;
      reference?: string;
      amount?: number;
      subscription?: { subscription_code?: string; plan?: { plan_code?: string } };
    };
    // Only act on paid invoices for active subscriptions
    if (inv.status === "success" && inv.subscription?.subscription_code) {
      const subCode  = inv.subscription.subscription_code;
      const planCode = inv.subscription.plan?.plan_code;

      // ── Check if this is a bundle renewal (annual) ──────────────────────────
      const { data: bundlePlanSetting } = await db
        .from("admin_settings")
        .select("value")
        .eq("key", "funnel_bundle_paystack_plan_code")
        .maybeSingle();
      const bundlePlanCode = bundlePlanSetting?.value as string | undefined;

      const { data: bundleWs } = await db
        .from("workspaces")
        .select("id, name, bundle_expires_at")
        .eq("bundle_paystack_sub_code", subCode)
        .maybeSingle();

      if (bundleWs || (bundlePlanCode && planCode === bundlePlanCode)) {
        const targetWs = bundleWs ?? (
          // Fallback: find by bundle plan code if sub code not yet stored
          await db.from("workspaces")
            .select("id, name, bundle_expires_at")
            .eq("bundle_paystack_sub_code", subCode)
            .maybeSingle()
            .then((r: { data: unknown }) => r.data as { id: string; name: string; bundle_expires_at: string | null } | null)
        );

        if (targetWs?.id) {
          const currentExpiry    = targetWs.bundle_expires_at ? new Date(targetWs.bundle_expires_at) : new Date();
          const newExpiresAt     = new Date(Math.max(currentExpiry.getTime(), Date.now()) + 365 * 24 * 60 * 60 * 1000).toISOString();
          const renewalRef       = inv.reference ?? `bundle_renewal:${subCode}:${Date.now()}`;
          const amountNgn        = Math.round((inv.amount ?? 0) / 100);

          await db.from("workspaces")
            .update({
              bundle_expires_at:     newExpiresAt,
              bundle_grace_ends_at:  null,  // Clear any grace period
              updated_at:            new Date().toISOString(),
            })
            .eq("id", targetWs.id);

          // Record invoice
          await db.from("billing_invoices").upsert({
            workspace_id:       targetWs.id,
            type:               "bundle_renewal",
            description:        "Leadash × Learn By Mizark — annual renewal",
            amount_kobo:        inv.amount ?? 0,
            paystack_reference: renewalRef,
            status:             "paid",
          }, { onConflict: "paystack_reference", ignoreDuplicates: true });

          // Fire automation
          const { data: member } = await db.from("workspace_members")
            .select("user_id").eq("workspace_id", targetWs.id).limit(1).maybeSingle();
          if (member?.user_id) {
            enqueueAutomation({
              workspace_id: targetWs.id,
              user_id:      member.user_id,
              event:        "user.bundle_renewed",
              payload:      { amount_ngn: amountNgn, new_expires_at: newExpiresAt },
            }).catch(() => {});
          }

          // Email
          const { email: userEmail } = await resolveWorkspaceEmail(db, targetWs.id);
          if (userEmail) {
            sendBundleRenewedEmail({ userEmail, amountNgn, newExpiresAt })
              .catch(e => console.error("[billing] bundle renewal email failed:", e));
          }

          console.log(`[billing] Bundle renewed: workspace=${targetWs.id} expires=${newExpiresAt}`);
          return NextResponse.json({ received: true });
        }
      }

      // Find the workspace tied to this subscription (main Leadash plan)
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

        // Record the renewal invoice for revenue tracking (idempotent via reference)
        const renewalRef = inv.reference ?? `renewal:${subCode}:${Date.now()}`;
        await db.from("billing_invoices").upsert({
          workspace_id:       ws.id,
          type:               "plan_renewal",
          description:        `${plan.name} plan — monthly renewal`,
          amount_kobo:        inv.amount ?? (plan.price_ngn * 100),
          paystack_reference: renewalRef,
          status:             "paid",
        }, { onConflict: "paystack_reference", ignoreDuplicates: true });

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

        // Renewal receipt — notify user of successful charge
        const { email: userEmail, name: wsName } = await resolveWorkspaceEmail(db, ws.id);
        if (userEmail) {
          sendSubscriptionRenewalSuccessEmail({
            userEmail,
            workspaceName: wsName ?? ws.id,
            planName:      plan.name,
            amountNgn:     Math.round((inv.amount ?? plan.price_ngn * 100) / 100),
            renewsAt:      nextRenewsAt,
          }).catch(e => console.error("[billing] renewal email failed:", e));
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  // ── Payment failed — enter grace period ──────────────────────────────────────
  if (event.event === "invoice.payment_failed") {
    const data = event.data as { subscription_code?: string };
    const subCode = data.subscription_code;

    // Check if this is a bundle subscription first
    if (subCode) {
      const { data: bundleWs } = await db
        .from("workspaces")
        .select("id, name, billing_email, billing_reminders_sent, workspace_members(user_id)")
        .eq("bundle_paystack_sub_code", subCode)
        .maybeSingle();

      if (bundleWs?.id) {
        const graceEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        await db.from("workspaces")
          .update({ bundle_grace_ends_at: graceEndsAt, updated_at: new Date().toISOString() })
          .eq("id", bundleWs.id);

        const todayKey = `bundle_grace_warn_${new Date().toISOString().slice(0, 10)}`;
        const sentMap  = ((bundleWs as unknown as Record<string, unknown>).billing_reminders_sent ?? {}) as Record<string, boolean>;
        if (!sentMap[todayKey]) {
          const { email: userEmail } = await resolveWorkspaceEmail(db, bundleWs.id);
          if (userEmail) {
            sendBundlePaymentFailedEmail({ userEmail, graceEndsAt })
              .catch(e => console.error("[billing] bundle payment failed email:", e));
          }
          await db.from("workspaces")
            .update({ billing_reminders_sent: { ...sentMap, [todayKey]: true } })
            .eq("id", bundleWs.id);
        }
        console.warn(`[billing] Bundle payment failed: workspace=${bundleWs.id} grace_ends_at=${graceEndsAt}`);

        const bundleMemberId = (bundleWs as unknown as { workspace_members?: Array<{ user_id: string }> }).workspace_members?.[0]?.user_id;
        if (bundleMemberId) {
          enqueueAutomation({
            event:        "billing.payment_failed",
            workspace_id: bundleWs.id,
            user_id:      bundleMemberId,
            payload:      { reason: "bundle", grace_ends_at: graceEndsAt },
          }).catch(() => {});
        }

        return NextResponse.json({ received: true });
      }
    }
    if (subCode) {
      const graceEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const todayKey = `grace_warn_${new Date().toISOString().slice(0, 10)}`;
      const { data: ws } = await db
        .from("workspaces")
        .update({
          plan_status:   "past_due",
          grace_ends_at: graceEndsAt,
          updated_at:    new Date().toISOString(),
        })
        .eq("paystack_sub_code", subCode)
        .select("id, name, billing_email, billing_reminders_sent, workspace_members(user_id)")
        .maybeSingle();

      if (ws?.id) {
        const paused = await pauseCampaignsForPoolOverage(db, ws.id);
        console.warn(`[billing] Payment failed: workspace=${ws.id} grace_ends_at=${graceEndsAt} campaigns_paused=${paused}`);

        // Send grace period warning immediately; mark key so daily cron doesn't duplicate
        const sentMap = ((ws as unknown as Record<string, unknown>).billing_reminders_sent ?? {}) as Record<string, boolean>;
        if (!sentMap[todayKey]) {
          const { email: userEmail } = await resolveWorkspaceEmail(db, ws.id);
          if (userEmail) {
            sendGracePeriodWarning({
              userEmail,
              workspaceName: (ws as unknown as { name: string }).name ?? ws.id,
              graceEndsAt,
            }).catch(e => console.error("[billing] grace warning email failed:", e));
          }
          await db.from("workspaces")
            .update({ billing_reminders_sent: { ...sentMap, [todayKey]: true } })
            .eq("id", ws.id);
        }

        const planMemberId = (ws as unknown as { workspace_members?: Array<{ user_id: string }> }).workspace_members?.[0]?.user_id;
        if (planMemberId) {
          enqueueAutomation({
            event:        "billing.payment_failed",
            workspace_id: ws.id,
            user_id:      planMemberId,
            payload:      { reason: "plan", grace_ends_at: graceEndsAt },
          }).catch(() => {});
        }
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
        .select("id, name")
        .eq("paystack_sub_code", subCode)
        .maybeSingle();

      if (ws?.id) {
        await db.from("workspaces").update({ subscription_renews_at: null }).eq("id", ws.id);
        const { paused, creditsExpired } = await downgradeWorkspaceToFree(db, ws.id, "subscription_disabled");
        console.warn(`[billing] Subscription disabled: workspace=${ws.id} campaigns_paused=${paused} credits_expired=${creditsExpired}`);
        await logActivity({
          workspace_id:   ws.id,
          workspace_name: ws.name,
          type:           "subscription_cancelled",
          title:          "Subscription cancelled",
          description:    `${ws.name ?? ws.id} — downgraded to Free (Paystack)`,
          metadata:       { subscription_code: subCode },
        });

        // Notify user their account has been downgraded
        const { email: userEmail } = await resolveWorkspaceEmail(db, ws.id);
        if (userEmail) {
          sendDowngradeNotification({
            userEmail,
            workspaceName: ws.name ?? ws.id,
            reason: "subscription_disabled",
          }).catch(e => console.error("[billing] disable downgrade email failed:", e));
        }
      }
    }
    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
