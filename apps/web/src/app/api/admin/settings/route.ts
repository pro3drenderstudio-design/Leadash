import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, adminClient };
}

const ALLOWED_KEYS = [
  "maintenance_mode",
  "announcement_banner",
  "signup_enabled",
  "trial_days",
  "default_plan",
  "lead_credits_on_signup",
  "support_email",
  "dedicated_ip_price_ngn",
  "dedicated_ip_price_usd",
] as const;

type SettingKey = typeof ALLOWED_KEYS[number];

export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await ctx.adminClient
    .from("admin_settings")
    .select("key, value, updated_at, updated_by");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return as key → value map
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

  const body = await req.json() as Partial<Record<SettingKey, unknown>>;
  const now = new Date().toISOString();

  const updates = Object.entries(body).filter(([key]) =>
    ALLOWED_KEYS.includes(key as SettingKey)
  );

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid keys provided" }, { status: 400 });
  }

  // Upsert each key
  const errors: string[] = [];
  for (const [key, value] of updates) {
    const { error } = await ctx.adminClient
      .from("admin_settings")
      .upsert({ key, value, updated_at: now, updated_by: ctx.user.id }, { onConflict: "key" });
    if (error) errors.push(`${key}: ${error.message}`);
  }

  if (errors.length) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  return NextResponse.json({ ok: true, updated: updates.map(([k]) => k) });
}
