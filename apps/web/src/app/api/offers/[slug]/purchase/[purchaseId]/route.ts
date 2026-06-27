import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { Offer, OfferPurchase } from "@/types/offers";

/**
 * GET /api/offers/[slug]/purchase/[purchaseId] — public.
 * Used by the success/confirmation page to poll until the webhook flips
 * status from 'pending' to 'paid' after the Paystack redirect.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; purchaseId: string }> }) {
  const { slug, purchaseId } = await params;
  const db = createAdminClient();

  const { data: offer, error: offerErr } = await db.from("offers").select("*").eq("slug", slug).maybeSingle();
  if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const { data: purchase, error: purchaseErr } = await db
    .from("offer_purchases")
    .select("*")
    .eq("id", purchaseId)
    .eq("offer_id", offer.id)
    .maybeSingle();
  if (purchaseErr) return NextResponse.json({ error: purchaseErr.message }, { status: 500 });
  if (!purchase) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });

  return NextResponse.json({ purchase: purchase as OfferPurchase, offer: offer as Offer });
}
