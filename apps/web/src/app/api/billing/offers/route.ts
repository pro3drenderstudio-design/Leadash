/**
 * GET /api/billing/offers
 *
 * Active targeted offers for the current workspace — drives the countdown
 * banner on the billing page. Returns only offers the workspace has an active
 * (unexpired) target for.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";
import { activeTargetedOffersForWorkspace } from "@/lib/offers/targeting";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;
  const { workspaceId, db } = auth;

  const targets = await activeTargetedOffersForWorkspace(db, workspaceId);
  if (targets.length === 0) return NextResponse.json({ offers: [] });

  const byId = new Map(targets.map(t => [t.offer_id, t]));
  const { data: offers } = await db
    .from("offers")
    .select("id, slug, name, price_ngn, compare_at_ngn, billing_interval, status")
    .in("id", [...byId.keys()])
    .eq("status", "active");

  type OfferRow = { id: string; slug: string; name: string; price_ngn: number; compare_at_ngn: number | null; billing_interval: string | null; status: string };
  const out = ((offers ?? []) as OfferRow[]).map(o => ({
    slug:            o.slug,
    name:            o.name,
    price_ngn:       o.price_ngn,
    compare_at_ngn:  o.compare_at_ngn,
    billing_interval: o.billing_interval,
    starts_at:       byId.get(o.id)?.starts_at ?? null,
    expires_at:      byId.get(o.id)?.expires_at ?? null,
  }));

  return NextResponse.json({ offers: out });
}
