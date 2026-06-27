import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { OfferPurchase, PurchaseStatus } from "@/types/offers";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

const VALID_STATUSES: PurchaseStatus[] = ["pending", "paid", "refunded", "failed"];

/** GET /api/admin/offers/[id]/purchases?status= — list purchases for an offer. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: offerId } = await params;
  const statusParam = req.nextUrl.searchParams.get("status");

  let query = db
    .from("offer_purchases")
    .select("*")
    .eq("offer_id", offerId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (statusParam && VALID_STATUSES.includes(statusParam as PurchaseStatus)) {
    query = query.eq("status", statusParam);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchases: (data ?? []) as OfferPurchase[] });
}
