import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { DEFAULT_CHECKOUT_CONFIG, type Offer, type OfferWithStats } from "@/types/offers";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** GET /api/admin/offers — list all offers with rollup stats. */
export async function GET() {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: offers, error } = await db
    .from("offers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const offerRows = (offers ?? []) as Offer[];
  if (offerRows.length === 0) return NextResponse.json({ offers: [] });

  const offerIds = offerRows.map(o => o.id);

  const [{ data: viewEvents }, { data: purchases }] = await Promise.all([
    db.from("offer_checkout_events").select("offer_id").eq("event_type", "view").in("offer_id", offerIds),
    db.from("offer_purchases").select("offer_id, total_ngn, status").eq("status", "paid").in("offer_id", offerIds),
  ]);

  const viewCounts = new Map<string, number>();
  for (const row of viewEvents ?? []) {
    viewCounts.set(row.offer_id, (viewCounts.get(row.offer_id) ?? 0) + 1);
  }

  const salesCounts = new Map<string, number>();
  const revenueTotals = new Map<string, number>();
  for (const row of (purchases ?? []) as { offer_id: string; total_ngn: number }[]) {
    salesCounts.set(row.offer_id, (salesCounts.get(row.offer_id) ?? 0) + 1);
    revenueTotals.set(row.offer_id, (revenueTotals.get(row.offer_id) ?? 0) + (row.total_ngn ?? 0));
  }

  const withStats: OfferWithStats[] = offerRows.map(offer => {
    const views = viewCounts.get(offer.id) ?? 0;
    const sales = salesCounts.get(offer.id) ?? 0;
    const revenue_ngn = revenueTotals.get(offer.id) ?? 0;
    const conversion_rate = views > 0 ? (sales / views) * 100 : 0;
    return { ...offer, views, sales, revenue_ngn, conversion_rate };
  });

  return NextResponse.json({ offers: withStats });
}

/** POST /api/admin/offers — create a new offer. Body: { name }. */
export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const baseSlug = slugify(name) || "offer";
  let slug = baseSlug;
  for (let i = 1; i <= 50; i++) {
    const { data: existing } = await db.from("offers").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i + 1}`;
  }

  const insert: Record<string, unknown> = {
    slug,
    name,
    status:              "draft",
    pricing_model:        "one_time",
    price_ngn:             0,
    currency_mode:         "auto",
    grants:                [],
    bumps:                 [],
    checkout:              DEFAULT_CHECKOUT_CONFIG,
    on_expire:             "hide_button",
    auto_grant:            true,
    manual_approval:       false,
    no_workspace_action:   "create",
    after_purchase:        "confirmation",
    send_receipt:          true,
    send_whatsapp:         false,
    notify_admin:          true,
    refund_window_days:    7,
    funnel_ids:            [],
  };

  const { data, error } = await db.from("offers").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer: data as Offer }, { status: 201 });
}
