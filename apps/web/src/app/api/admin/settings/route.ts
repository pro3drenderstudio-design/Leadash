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
  "verifier_provider",
  "credit_rate_verify",
  "credit_rate_discover",
  "credit_rate_first_line",
  "credit_rate_scrape",
  "domain_markup_type",
  "domain_markup_value",
  "domain_registrar",
  // CRM settings
  "crm_business_hours",
  "crm_canned_responses",
  "crm_custom_fields",
  "crm_sla_config",
  "crm_support_email",
  "crm_marketing_email",
  "crm_auto_reopen_on_reply",
  // Brand & tracking
  "meta_pixel_id",
  "social_twitter_url",
  "social_linkedin_url",
  "social_instagram_url",
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

  // Validate enum settings
  for (const [key, value] of updates) {
    if (key === "verifier_provider") {
      if (value !== "reoon" && value !== "leadash") {
        return NextResponse.json({ error: "verifier_provider must be 'reoon' or 'leadash'" }, { status: 400 });
      }
    }
    if (key === "domain_markup_type") {
      if (value !== "none" && value !== "flat" && value !== "percent") {
        return NextResponse.json({ error: "domain_markup_type must be 'none', 'flat', or 'percent'" }, { status: 400 });
      }
    }
    if (key === "domain_registrar") {
      if (value !== "namecheap" && value !== "porkbun") {
        return NextResponse.json({ error: "domain_registrar must be 'namecheap' or 'porkbun'" }, { status: 400 });
      }
    }
  }

  // Validate numeric settings
  for (const [key, value] of updates) {
    if (key === "dedicated_ip_price_ngn") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1_000 || n > 10_000_000) {
        return NextResponse.json({ error: "dedicated_ip_price_ngn must be between ₦1,000 and ₦10,000,000" }, { status: 400 });
      }
    }
    if (key === "dedicated_ip_price_usd") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1 || n > 10_000) {
        return NextResponse.json({ error: "dedicated_ip_price_usd must be between $1 and $10,000" }, { status: 400 });
      }
    }
    if (key === "trial_days") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        return NextResponse.json({ error: "trial_days must be an integer between 0 and 365" }, { status: 400 });
      }
    }
    if (key === "lead_credits_on_signup") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return NextResponse.json({ error: "lead_credits_on_signup must be between 0 and 1,000,000" }, { status: 400 });
      }
    }
    if (key === "domain_markup_value") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 10_000) {
        return NextResponse.json({ error: "domain_markup_value must be between 0 and 10,000" }, { status: 400 });
      }
    }
    if (["credit_rate_verify","credit_rate_discover","credit_rate_first_line","credit_rate_scrape"].includes(key)) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0 || n > 100) {
        return NextResponse.json({ error: `${key} must be a positive number ≤ 100` }, { status: 400 });
      }
    }
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
