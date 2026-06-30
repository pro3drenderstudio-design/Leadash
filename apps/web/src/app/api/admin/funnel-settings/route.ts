/**
 * GET  /api/admin/funnel-settings — returns all funnel/WA/CRM admin_settings keys
 * PATCH /api/admin/funnel-settings — upserts one or more keys (admin only)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const FUNNEL_KEYS = [
  // Funnel pricing & timing
  "funnel_bundle_offer_days",
  "funnel_challenge_price_ngn",
  "funnel_bundle_price_ngn",
  "funnel_bundle_duration_months",
  "funnel_bundle_inbox_count",
  "funnel_bundle_grace_period_days",
  "funnel_bundle_renewal_warning_days",
  "funnel_bundle_paystack_plan_code",
  // Funnel content & links
  "funnel_partner_name",
  "funnel_mizark_invite_link",
  "funnel_vsl_youtube_id",
] as const;

type FunnelKey = typeof FUNNEL_KEYS[number];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await ctx.db
    .from("admin_settings")
    .select("key, value, updated_at, updated_by")
    .in("key", FUNNEL_KEYS as unknown as string[]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings: Record<string, unknown> = {};
  const meta: Record<string, { updated_at: string; updated_by: string | null }> = {};

  for (const row of data ?? []) {
    settings[row.key] = row.value;
    meta[row.key] = { updated_at: row.updated_at, updated_by: row.updated_by };
  }

  return NextResponse.json({ settings, meta });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as Record<string, unknown>;
  const now  = new Date().toISOString();

  const updates = Object.entries(body).filter(
    ([k]) => (FUNNEL_KEYS as readonly string[]).includes(k),
  ) as [FunnelKey, unknown][];

  if (!updates.length) {
    return NextResponse.json({ error: "No valid keys to update" }, { status: 400 });
  }

  const errors: string[] = [];
  for (const [key, value] of updates) {
    const { error } = await ctx.db
      .from("admin_settings")
      .upsert({ key, value, updated_at: now, updated_by: ctx.user.id }, { onConflict: "key" });
    if (error) errors.push(`${key}: ${error.message}`);
  }

  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  return NextResponse.json({ ok: true, updated: updates.map(([k]) => k) });
}
