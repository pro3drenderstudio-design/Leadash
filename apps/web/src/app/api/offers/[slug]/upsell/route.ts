/**
 * POST /api/offers/[slug]/upsell — public.
 * Accept/decline the post-purchase upsell (or, after declining the upsell, the
 * downsell) shown on the confirmation page.
 * Body: { purchase_id, accept, stage?: "upsell" | "downsell" } — stage defaults
 * to "upsell"; pass "downsell" when accepting/declining the downsell offer
 * shown after the upsell was declined.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPaystackPayment, chargePaystackAuthorization } from "@/lib/billing/paystack";
import { fulfillGrant } from "@/lib/offers/granters";
import type { Offer, OfferPurchase, OfferLineItem, GrantedItem, OfferUpsell } from "@/types/offers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();

  let body: { purchase_id?: string; accept?: boolean; stage?: "upsell" | "downsell" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { purchase_id, accept } = body;
  const stage = body.stage === "downsell" ? "downsell" : "upsell";
  if (!purchase_id || typeof accept !== "boolean") {
    return NextResponse.json({ error: "purchase_id and accept (boolean) required" }, { status: 400 });
  }

  const { data: offerRow, error: offerErr } = await db.from("offers").select("*").eq("slug", slug).maybeSingle();
  if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 });
  if (!offerRow) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  const offer = offerRow as Offer;

  const { data: purchaseRow, error: purchaseErr } = await db
    .from("offer_purchases")
    .select("*")
    .eq("id", purchase_id)
    .eq("offer_id", offer.id)
    .maybeSingle();
  if (purchaseErr) return NextResponse.json({ error: purchaseErr.message }, { status: 500 });
  if (!purchaseRow) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  const purchase = purchaseRow as OfferPurchase;

  if (purchase.status !== "paid") {
    return NextResponse.json({ error: "Purchase must be paid before an upsell can be processed" }, { status: 400 });
  }

  const offerItem: OfferUpsell | null = stage === "upsell" ? offer.upsell : offer.downsell;
  const statusColumn = stage === "upsell" ? "upsell_status" : "downsell_status";

  if (!accept) {
    await db.from("offer_purchases").update({ [statusColumn]: "declined" }).eq("id", purchase.id);
    // After declining the upsell, surface the downsell (if any) for the frontend to show next.
    if (stage === "upsell" && offer.downsell?.is_active) {
      return NextResponse.json({ ok: true, downsell: offer.downsell });
    }
    return NextResponse.json({ ok: true });
  }

  // ── accept === true ──────────────────────────────────────────────────────────
  if (!offerItem || !offerItem.is_active) {
    return NextResponse.json({ error: `This offer has no ${stage} configured` }, { status: 400 });
  }
  if (!purchase.paystack_reference) {
    return NextResponse.json({ error: "No payment authorization available for this purchase" }, { status: 400 });
  }

  let authorizationCode: string | null;
  try {
    const verified = await verifyPaystackPayment(purchase.paystack_reference);
    authorizationCode = verified.authorizationCode;
  } catch (err) {
    console.error(`[offers/${stage}] verifyPaystackPayment failed:`, err);
    return NextResponse.json({ error: "Could not verify original payment authorization" }, { status: 502 });
  }
  if (!authorizationCode) {
    return NextResponse.json({ error: "No reusable card authorization found for this purchase" }, { status: 400 });
  }

  let upsellFeesKobo: number | null = null;
  try {
    const charge = await chargePaystackAuthorization({
      authorizationCode,
      email:      purchase.buyer_email ?? "",
      amountKobo: offerItem.price_ngn * 100,
      metadata:   { type: `offer_${stage}`, purchase_id: purchase.id },
    });
    upsellFeesKobo = charge.feesKobo;
  } catch (err) {
    console.error(`[offers/${stage}] charge failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : `${stage === "upsell" ? "Upsell" : "Downsell"} charge failed` },
      { status: 502 },
    );
  }

  // ── Charge succeeded — fulfill grant + update purchase ──────────────────────
  let grantedItems = (purchase.granted_items ?? []) as GrantedItem[];
  if (offerItem.grant && purchase.workspace_id && purchase.user_id) {
    const item = await fulfillGrant(db, offerItem.grant, {
      workspaceId: purchase.workspace_id,
      userId:      purchase.user_id,
      offerName:   offer.name,
      reference:   purchase.paystack_reference,
    });
    grantedItems = [...grantedItems, item];
  } else if (offerItem.grant) {
    grantedItems = [...grantedItems, {
      grant_id: offerItem.grant.id,
      type:     offerItem.grant.type,
      status:   "pending_manual",
      detail:   "No workspace on purchase",
    }];
  }

  const newLineItem: OfferLineItem = { kind: stage, label: offerItem.label, amount_ngn: offerItem.price_ngn };
  const updatedLineItems = [...purchase.line_items, newLineItem];

  await db.from("offer_purchases").update({
    line_items:      updatedLineItems,
    total_ngn:       purchase.total_ngn + offerItem.price_ngn,
    // Cumulative — the upsell is a second Paystack charge on the same purchase
    ...(upsellFeesKobo != null
      ? { fees_kobo: ((purchase as { fees_kobo?: number | null }).fees_kobo ?? 0) + upsellFeesKobo }
      : {}),
    [statusColumn]:  "accepted",
    granted_items:   grantedItems,
  }).eq("id", purchase.id);

  return NextResponse.json({ ok: true });
}
