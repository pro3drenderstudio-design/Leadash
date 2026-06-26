import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? { db, userId: user.id } : null;
}

// GET — single page with blocks
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { pageId } = await params;

  const { data, error } = await db
    .from("funnel_pages")
    .select("*")
    .eq("id", pageId)
    .single();

  if (error) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ page: data });
}

// PATCH — update blocks/settings/connection/name/slug
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { pageId } = await params;

  const body = await req.json() as Record<string, unknown>;
  const allowed = ["name", "slug", "step_order", "page_type", "status", "blocks", "settings", "connection"];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }

  const { data, error } = await db.from("funnel_pages").update(update).eq("id", pageId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: data });
}

// DELETE — remove page
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { pageId } = await params;

  const { error } = await db.from("funnel_pages").delete().eq("id", pageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
