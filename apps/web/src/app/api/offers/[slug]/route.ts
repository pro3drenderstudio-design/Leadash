import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Offer } from "@/types/offers";

/** GET /api/offers/[slug] — public. Powers the standalone /o/[slug] checkout page. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();

  const { data: offer, error } = await db.from("offers").select("*").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const typedOffer = offer as Offer;

  if (typedOffer.status === "draft") {
    const isPreview = req.nextUrl.searchParams.get("preview") === "1";
    let isAdmin = false;
    if (isPreview) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
        isAdmin = !!admin;
      }
    }
    if (!isAdmin) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  const closed = typedOffer.expires_at ? new Date(typedOffer.expires_at) < new Date() : false;

  let sold_out = false;
  let spots_left: number | null = null;
  if (typedOffer.stock_limit !== null) {
    const { count } = await db
      .from("offer_purchases")
      .select("*", { count: "exact", head: true })
      .eq("offer_id", typedOffer.id)
      .eq("status", "paid");
    const paidCount = count ?? 0;
    sold_out = paidCount >= typedOffer.stock_limit;
    spots_left = Math.max(0, typedOffer.stock_limit - paidCount);
  }

  // Resolve / mint a session id for funnel tracking.
  const incomingSessionId = req.nextUrl.searchParams.get("s");
  const session_id = incomingSessionId || (globalThis.crypto?.randomUUID?.() ?? `s_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  // Non-blocking — don't hold up the response on these writes.
  void db.from("offers").update({ views_count: (typedOffer.views_count ?? 0) + 1 }).eq("id", typedOffer.id)
    .then(() => {}).catch((e: unknown) => console.error("[offers/get] views_count increment failed:", e));
  void db.from("offer_checkout_events").insert({
    offer_id:   typedOffer.id,
    session_id,
    event_type: "view",
  }).then(() => {}).catch((e: unknown) => console.error("[offers/get] view event insert failed:", e));

  return NextResponse.json({ offer: typedOffer, closed, sold_out, spots_left, session_id });
}
