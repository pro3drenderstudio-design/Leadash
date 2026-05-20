import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

const LEADPAY_KEYS = [
  "leadpay_platform_fee_pct",
  "leadpay_fx_spread_pct",
  "leadpay_min_fee_cents",
  "leadpay_card_creation_fee_cents",
  "leadpay_card_monthly_fee_cents",
  "leadpay_min_payout_ngn",
  "leadpay_auto_approve_payout_ngn",
  "leadpay_max_invoice_usd",
  "leadpay_card_max_per_user",
  "leadpay_enabled",
  "leadpay_fx_rate_override",
] as const;

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const { data: rows } = await db
    .from("admin_settings")
    .select("key, value")
    .in("key", LEADPAY_KEYS as unknown as string[]);

  const settings = Object.fromEntries((rows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const body = await req.json() as Record<string, unknown>;

  const updates = Object.entries(body).filter(([k]) =>
    (LEADPAY_KEYS as readonly string[]).includes(k)
  );

  await Promise.all(updates.map(([key, value]) =>
    db.from("admin_settings")
      .upsert({ key, value: String(value) }, { onConflict: "key" })
  ));

  return NextResponse.json({ ok: true });
}
