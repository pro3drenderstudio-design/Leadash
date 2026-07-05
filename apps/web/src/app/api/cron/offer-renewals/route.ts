/**
 * GET /api/cron/offer-renewals
 *
 * Runs daily (or more frequently). Finds all recurring offer_purchases where
 * next_renewal_at <= now, charges the buyer's saved card via Paystack charge
 * authorization, re-grants the offer items (refreshing plan period + credits),
 * and advances next_renewal_at by the billing interval.
 *
 * If authorization_code is not stored yet (legacy purchases pre-migration),
 * fetches it live from Paystack using the stored paystack_reference.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackPayment, chargePaystackAuthorization } from "@/lib/billing/paystack";
import { fulfillAllGrants } from "@/lib/offers/granters";
import type { Offer } from "@/types/offers";

export const maxDuration = 60;

const INTERVAL_DAYS: Record<string, number> = { monthly: 30, quarterly: 91, annual: 365 };

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = createAdminClient();
  const now = new Date().toISOString();

  let charged = 0;
  let failed  = 0;
  let skipped = 0;

  // Find all paid recurring purchases that are due for renewal.
  const { data: duePurchases, error } = await db
    .from("offer_purchases")
    .select("*, offers!inner(pricing_model, billing_interval, grants, bumps, name)")
    .eq("status", "paid")
    .lte("next_renewal_at", now)
    .not("next_renewal_at", "is", null);

  if (error) {
    console.error("[offer-renewals] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const row of duePurchases ?? []) {
    const purchase = row as typeof row & {
      offers: { pricing_model: string; billing_interval: string | null; grants: Offer["grants"]; bumps: Offer["bumps"]; name: string };
    };

    if (purchase.offers.pricing_model !== "recurring") {
      skipped++;
      continue;
    }

    // Resolve authorization_code — stored on purchase or fetched live.
    let authCode: string | null = (purchase as { authorization_code?: string | null }).authorization_code ?? null;
    if (!authCode && purchase.paystack_reference) {
      try {
        const verified = await verifyPaystackPayment(purchase.paystack_reference);
        authCode = verified.authorizationCode;
        if (authCode) {
          // Persist so future renewals don't need this lookup.
          await db.from("offer_purchases")
            .update({ authorization_code: authCode, paystack_customer_code: verified.customerCode ?? null })
            .eq("id", purchase.id);
        }
      } catch (err) {
        console.error(`[offer-renewals] verify failed purchase=${purchase.id}:`, err instanceof Error ? err.message : err);
      }
    }

    if (!authCode || !purchase.buyer_email) {
      console.warn(`[offer-renewals] no auth code for purchase=${purchase.id}, skipping`);
      skipped++;
      continue;
    }

    const intervalDays = INTERVAL_DAYS[purchase.offers.billing_interval ?? "monthly"] ?? 30;
    const nextRenewalAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();
    const renewalRef = `renewal:${purchase.id}:${Date.now()}`;

    // Charge the card.
    try {
      await chargePaystackAuthorization({
        authorizationCode: authCode,
        email:             purchase.buyer_email,
        amountKobo:        purchase.total_ngn * 100,
        metadata: {
          type:        "offer_renewal",
          purchase_id: purchase.id,
          offer_name:  purchase.offers.name,
        },
      });
    } catch (err) {
      console.error(`[offer-renewals] charge failed purchase=${purchase.id}:`, err instanceof Error ? err.message : err);
      // Advance next_renewal_at by 1 day for retry tomorrow; don't re-grant.
      await db.from("offer_purchases")
        .update({ next_renewal_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", purchase.id);
      failed++;
      continue;
    }

    // Re-grant all offer items for the new period.
    if (purchase.workspace_id && purchase.user_id) {
      await fulfillAllGrants(db, purchase.offers.grants, {
        workspaceId: purchase.workspace_id,
        userId:      purchase.user_id,
        offerName:   purchase.offers.name,
        reference:   renewalRef,
      }).catch(err => console.error(`[offer-renewals] fulfillAllGrants failed purchase=${purchase.id}:`, err instanceof Error ? err.message : err));
    }

    // Advance the renewal date.
    await db.from("offer_purchases")
      .update({ next_renewal_at: nextRenewalAt })
      .eq("id", purchase.id);

    charged++;
  }

  return NextResponse.json({ ok: true, charged, failed, skipped });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
