import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { refundPaystackPayment } from "@/lib/billing/paystack";
import { revokeGrant } from "@/lib/offers/granters";
import type { Offer, OfferBump, OfferPurchase, GrantedItem, OfferGrant } from "@/types/offers";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

/** POST /api/admin/offers/purchases/[purchaseId]/refund */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ purchaseId: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { purchaseId } = await params;
  const { data: purchase, error: fetchErr } = await db
    .from("offer_purchases")
    .select("*")
    .eq("id", purchaseId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!purchase) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });

  const typedPurchase = purchase as OfferPurchase;
  if (typedPurchase.status !== "paid") {
    return NextResponse.json({ error: `Purchase status is '${typedPurchase.status}' — only 'paid' purchases can be refunded` }, { status: 400 });
  }
  if (!typedPurchase.paystack_reference) {
    return NextResponse.json({ error: "Purchase has no Paystack reference" }, { status: 400 });
  }

  // ── Call Paystack first — never mark refunded unless this succeeds ────────
  try {
    await refundPaystackPayment({ reference: typedPurchase.paystack_reference, reason: "Offer purchase refund (admin)" });
  } catch (err) {
    console.error("[offers/refund] Paystack refund failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Paystack refund failed" },
      { status: 502 },
    );
  }

  const refundedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await db
    .from("offer_purchases")
    .update({ status: "refunded", refunded_at: refundedAt })
    .eq("id", purchaseId)
    .select()
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // ── Revoke any grants that were actually fulfilled ─────────────────────────
  const { data: offer } = await db.from("offers").select("*").eq("id", typedPurchase.offer_id).maybeSingle();
  if (offer && typedPurchase.workspace_id) {
    const offerTyped = offer as Offer;
    const allGrants: OfferGrant[] = [
      ...offerTyped.grants,
      ...offerTyped.bumps.map((b: OfferBump) => b.grant),
      ...(offerTyped.upsell?.grant ? [offerTyped.upsell.grant] : []),
      ...(offerTyped.downsell?.grant ? [offerTyped.downsell.grant] : []),
    ];
    const grantedItems = (typedPurchase.granted_items ?? []) as GrantedItem[];

    for (const item of grantedItems) {
      if (item.status !== "granted") continue;
      const grant = allGrants.find(g => g.id === item.grant_id);
      if (!grant) continue;
      await revokeGrant(db, grant, {
        workspaceId: typedPurchase.workspace_id,
        reference:   typedPurchase.paystack_reference,
      });
    }
  }

  return NextResponse.json({ ok: true, purchase: updated as OfferPurchase });
}
