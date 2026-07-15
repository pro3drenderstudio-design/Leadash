/**
 * GET  /api/crm/contacts?search=query&limit=10  — search
 * POST /api/crm/contacts                        — create a new contact
 * Search CRM contacts by name, email, or WhatsApp number.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalisePhoneNG } from "@/lib/phone";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) return null;
  return { user, db };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const limit  = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "10"), 50);

  let query = db
    .from("crm_contacts")
    .select("id, display_name, email, whatsapp_number, phone, avatar_url, lifecycle_stage")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,email.ilike.%${search}%,whatsapp_number.ilike.%${search}%,phone.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contacts: data ?? [] });
}

/**
 * POST /api/crm/contacts — manually create a contact from the admin UI.
 * Body accepts every editable field. At minimum one identifying field
 * (email or whatsapp_number) must be supplied so we can dedupe.
 * If an existing contact is found on email or whatsapp_number, we merge
 * onto it instead of creating a duplicate.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = ctx;

  const body = await req.json() as {
    display_name?:    string | null;
    email?:           string | null;
    phone?:           string | null;
    whatsapp_number?: string | null;
    company?:         string | null;
    lifecycle_stage?: string | null;
    tags?:            string[];
    notes?:           string | null;
  };

  const email       = body.email?.trim().toLowerCase() || null;
  const whatsappRaw = body.whatsapp_number ?? body.phone ?? null;
  const whatsapp    = normalisePhoneNG(whatsappRaw);
  const displayName = body.display_name?.trim() || null;

  if (!email && !whatsapp && !displayName) {
    return NextResponse.json({ error: "Provide at least a name, email, or WhatsApp number." }, { status: 400 });
  }

  // Dedupe by email first, then WhatsApp number. Whichever hits, we merge onto.
  let existingId: string | null = null;
  if (email) {
    const { data: e } = await db.from("crm_contacts").select("id").eq("email", email)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    existingId = (e?.id as string) ?? null;
  }
  if (!existingId && whatsapp) {
    const { data: w } = await db.from("crm_contacts").select("id").eq("whatsapp_number", whatsapp)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    existingId = (w?.id as string) ?? null;
  }

  const patch: Record<string, unknown> = {
    display_name:    displayName,
    email,
    whatsapp_number: whatsapp,
    phone:           body.phone?.trim() || null,
    company:         body.company?.trim() || null,
    lifecycle_stage: body.lifecycle_stage ?? "lead",
    tags:            Array.isArray(body.tags) ? body.tags : [],
    notes:           body.notes ?? null,
    updated_at:      new Date().toISOString(),
  };
  // Only overwrite non-null values so a manual edit doesn't blank an
  // existing field when the form leaves it empty.
  for (const k of Object.keys(patch)) if (patch[k] == null || patch[k] === "") delete patch[k];

  if (existingId) {
    const { data, error } = await db.from("crm_contacts").update(patch).eq("id", existingId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ contact: data, merged: true });
  }

  const { data, error } = await db.from("crm_contacts").insert({
    ...patch,
    status: "active",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data, merged: false });
}
