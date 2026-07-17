import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Offer } from "@/types/offers";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

// Every column except id / created_at / created_by is patchable. slug is
// included — editable, but uniqueness is re-checked below when it changes.
const PATCHABLE_FIELDS = new Set<string>([
  "slug", "name", "status",
  "pricing_model", "price_ngn", "compare_at_ngn", "currency_mode", "billing_interval",
  "trial_days", "installments", "pwyw_min_ngn",
  "grants", "bumps", "upsell", "downsell",
  "checkout",
  "expires_at", "on_expire", "stock_limit", "recover_abandoned",
  "auto_grant", "manual_approval", "no_workspace_action", "after_purchase", "custom_url",
  "send_receipt", "send_whatsapp", "notify_admin", "refund_window_days",
  "funnel_ids", "is_targeted", "sales_page",
]);

// Nested jsonb fields that should be shallow-merged with the existing value
// rather than replaced wholesale, when the key is present in the request body.
const MERGE_FIELDS = new Set(["checkout", "installments", "upsell", "downsell"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { data, error } = await db.from("offers").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  return NextResponse.json({ offer: data as Offer });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { data: current, error: fetchErr } = await db.from("offers").select("*").eq("id", id).maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Slug uniqueness re-check if it's changing.
  if (typeof body.slug === "string" && body.slug !== current.slug) {
    const newSlug = body.slug.trim();
    if (!newSlug) return NextResponse.json({ error: "slug cannot be empty" }, { status: 400 });
    const { data: clash } = await db.from("offers").select("id").eq("slug", newSlug).neq("id", id).maybeSingle();
    if (clash) return NextResponse.json({ error: "Slug already in use by another offer" }, { status: 409 });
  }

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(key)) continue;
    if (MERGE_FIELDS.has(key) && value && typeof value === "object" && !Array.isArray(value)) {
      const existing = (current as Record<string, unknown>)[key];
      updates[key] = {
        ...(existing && typeof existing === "object" ? existing : {}),
        ...(value as Record<string, unknown>),
      };
    } else {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No patchable fields in body" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await db.from("offers").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer: data as Offer });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { error } = await db.from("offers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
