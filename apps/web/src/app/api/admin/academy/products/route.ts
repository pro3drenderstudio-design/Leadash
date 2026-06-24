import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

// Fields the PATCH endpoint is allowed to touch. Allow-listing keeps callers
// from inadvertently writing to internal columns (id, slug uniqueness, etc.).
const PATCHABLE_FIELDS = new Set([
  "price_ngn",
  "credits_grant",
  "leadash_months",
  "is_active",
  "is_published",
  "name",
  "description",
  "thumbnail_url",
  "trailer_playback_id",
  "sales_page_body",
  "pricing_type",
  "certificate_enabled",
  "completion_threshold_pct",
  // Banner + CTA fields added in migration 054
  "banner_image_url",
  "banner_headline",
  "banner_sub",
  "banner_cta_text",
  "banner_cta_url",
]);

export async function PATCH(req: NextRequest) {
  const db = await requireAdmin(req);
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Drop any keys we don't explicitly allow so a typo or accident can't
  // overwrite something it shouldn't (e.g. slug, id, created_at).
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "id") continue;
    if (PATCHABLE_FIELDS.has(k)) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no patchable fields in body" }, { status: 400 });
  }

  const { data, error } = await db.from("academy_products").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}
