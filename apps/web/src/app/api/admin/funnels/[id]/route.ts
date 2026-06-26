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

// GET — single funnel + pages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  const [funnelRes, pagesRes] = await Promise.all([
    db.from("funnels").select("*").eq("id", id).single(),
    db.from("funnel_pages").select("id, name, slug, step_order, page_type, status, published_at, created_at, updated_at").eq("funnel_id", id).order("step_order"),
  ]);

  if (funnelRes.error) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ funnel: funnelRes.data, pages: pagesRes.data ?? [] });
}

// PATCH — update funnel
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  const body = await req.json() as Record<string, unknown>;
  const allowed = ["name", "slug", "custom_domain", "status", "global_styles", "settings"];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }

  const { data, error } = await db.from("funnels").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ funnel: data });
}

// DELETE — remove funnel + pages
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { db } = auth;
  const { id } = await params;

  await db.from("funnel_pages").delete().eq("funnel_id", id);
  const { error } = await db.from("funnels").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
