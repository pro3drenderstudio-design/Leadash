import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { OfferAnalytics, OfferLineItem } from "@/types/offers";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

const GRANT_KIND_META: Record<"base" | "bump" | "upsell" | "downsell", { label: string; color: string }> = {
  base:     { label: "Base offer", color: "#F97316" },
  bump:     { label: "Order bump", color: "#22D3EE" },
  upsell:   { label: "Upsell",     color: "#A78BFA" },
  downsell: { label: "Downsell",   color: "#9A9AA8" },
};

const FUNNEL_STAGES: Array<"view" | "started" | "payment_added" | "purchased"> = [
  "view", "started", "payment_added", "purchased",
];

interface PurchaseRow {
  id: string;
  status: string;
  total_ngn: number;
  line_items: OfferLineItem[];
  discount_code_id: string | null;
  created_at: string;
}

interface EventRow {
  session_id: string;
  event_type: string;
}

interface DiscountCodeRow {
  id: string;
  code: string;
  redemptions: number;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: offerId } = await params;
  const { data: offer, error: offerErr } = await db.from("offers").select("id").eq("id", offerId).maybeSingle();
  if (offerErr) return NextResponse.json({ error: offerErr.message }, { status: 500 });
  if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  const [{ data: purchases }, { data: events }, { data: discountCodes }] = await Promise.all([
    db.from("offer_purchases")
      .select("id, status, total_ngn, line_items, discount_code_id, created_at")
      .eq("offer_id", offerId),
    db.from("offer_checkout_events").select("session_id, event_type").eq("offer_id", offerId),
    db.from("offer_discount_codes").select("id, code, redemptions").eq("offer_id", offerId),
  ]);

  const allPurchases = (purchases ?? []) as PurchaseRow[];
  const paidPurchases = allPurchases.filter((p: PurchaseRow) => p.status === "paid");
  const refundedPurchases = allPurchases.filter((p: PurchaseRow) => p.status === "refunded");

  // ── Tiles ──────────────────────────────────────────────────────────────────
  const revenue_ngn = paidPurchases.reduce((sum: number, p: PurchaseRow) => sum + (p.total_ngn ?? 0), 0);
  const sales = paidPurchases.length;
  const viewEvents = ((events ?? []) as EventRow[]).filter((e: EventRow) => e.event_type === "view");
  const checkout_views = new Set(viewEvents.map(e => e.session_id)).size;
  const conversion_rate = checkout_views > 0 ? (sales / checkout_views) * 100 : 0;
  const paidPlusRefunded = paidPurchases.length + refundedPurchases.length;
  const refund_rate = paidPlusRefunded > 0 ? (refundedPurchases.length / paidPlusRefunded) * 100 : 0;

  // ── Revenue trend — last 28 days ────────────────────────────────────────────
  const days = 28;
  const trendMap = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    trendMap.set(key, 0);
  }
  for (const p of paidPurchases) {
    const key = new Date(p.created_at).toISOString().slice(0, 10);
    if (trendMap.has(key)) {
      trendMap.set(key, (trendMap.get(key) ?? 0) + (p.total_ngn ?? 0));
    }
  }
  const revenue_trend = Array.from(trendMap.entries()).map(([date, revenue_ngn]) => ({ date, revenue_ngn }));

  // ── Checkout funnel ──────────────────────────────────────────────────────────
  const stageSessionSets = new Map<string, Set<string>>();
  for (const stage of FUNNEL_STAGES) stageSessionSets.set(stage, new Set());
  for (const e of (events ?? []) as EventRow[]) {
    const set = stageSessionSets.get(e.event_type);
    if (set) set.add(e.session_id);
  }
  const viewCount = stageSessionSets.get("view")?.size ?? 0;
  const checkout_funnel = FUNNEL_STAGES.map(stage => {
    const count = stageSessionSets.get(stage)?.size ?? 0;
    const pct = stage === "view" ? 100 : (viewCount > 0 ? (count / viewCount) * 100 : 0);
    return { stage, count, pct };
  });

  // ── Revenue by grant kind ────────────────────────────────────────────────────
  const revenueByKind = new Map<"base" | "bump" | "upsell" | "downsell", number>();
  for (const p of paidPurchases) {
    const lineItems = (p.line_items ?? []) as OfferLineItem[];
    for (const item of lineItems) {
      revenueByKind.set(item.kind, (revenueByKind.get(item.kind) ?? 0) + (item.amount_ngn ?? 0));
    }
  }
  const revenue_by_grant = (["base", "bump", "upsell", "downsell"] as const)
    .filter(kind => revenueByKind.has(kind))
    .map(kind => ({
      label:  GRANT_KIND_META[kind].label,
      amount_ngn: revenueByKind.get(kind) ?? 0,
      color:  GRANT_KIND_META[kind].color,
    }));

  // ── Discount code performance ────────────────────────────────────────────────
  const revenueByCode = new Map<string, number>();
  for (const p of paidPurchases) {
    if (p.discount_code_id) {
      revenueByCode.set(p.discount_code_id, (revenueByCode.get(p.discount_code_id) ?? 0) + (p.total_ngn ?? 0));
    }
  }
  const discount_code_performance = ((discountCodes ?? []) as DiscountCodeRow[]).map((c: DiscountCodeRow) => ({
    code:        c.code,
    redemptions: c.redemptions,
    revenue_ngn: revenueByCode.get(c.id) ?? 0,
  }));

  const analytics: OfferAnalytics = {
    tiles: { revenue_ngn, sales, checkout_views, conversion_rate, refund_rate },
    revenue_trend,
    checkout_funnel,
    revenue_by_grant,
    discount_code_performance,
  };

  return NextResponse.json(analytics);
}
