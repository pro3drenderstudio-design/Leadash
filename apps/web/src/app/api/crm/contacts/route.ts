/**
 * GET /api/crm/contacts?search=query&limit=10
 * Search CRM contacts by name, email, or WhatsApp number.
 */
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
