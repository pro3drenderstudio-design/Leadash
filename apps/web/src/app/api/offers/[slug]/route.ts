import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { DEFAULT_CHECKOUT_CONFIG, type Offer } from "@/types/offers";
import { hasActiveOfferTargetForUser } from "@/lib/offers/targeting";

/** GET /api/offers/[slug] — public. Powers the standalone /o/[slug] checkout page. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAdminClient();

  const { data: offer, error } = await db.from("offers").select("*").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const typedOffer = offer as Offer;

  // Resolve the viewer once — admins previewing (?preview=1) can see offers that
  // are otherwise gated (draft, or targeted-and-not-yet-granted to them), so the
  // "Preview checkout" button works for sponsored/targeted offers too.
  const isPreview = req.nextUrl.searchParams.get("preview") === "1";
  let currentUserId: string | null = null;
  let isAdmin = false;
  {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
    if (user) {
      const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
      isAdmin = !!admin;
    }
  }
  const isAdminPreview = isPreview && isAdmin;

  if (typedOffer.status === "draft" && !isAdminPreview) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  // Targeted offers are only visible to workspaces with an active target
  // (admins previewing bypass this).
  if ((typedOffer as unknown as { is_targeted?: boolean }).is_targeted && !isAdminPreview) {
    const allowed = currentUserId ? await hasActiveOfferTargetForUser(db, typedOffer.id, currentUserId) : false;
    if (!allowed) return NextResponse.json({ error: "This offer isn't available.", targeted: true }, { status: 404 });
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

  // Merge checkout with defaults so missing keys (from older offers) never crash the client.
  const normalizedOffer: Offer = {
    ...typedOffer,
    checkout: { ...DEFAULT_CHECKOUT_CONFIG, ...typedOffer.checkout },
  };

  return NextResponse.json({ offer: normalizedOffer, closed, sold_out, spots_left, session_id });
}
