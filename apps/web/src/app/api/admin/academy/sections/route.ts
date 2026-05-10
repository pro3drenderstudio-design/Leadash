import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function GET(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const productId = req.nextUrl.searchParams.get("product_id");
  const query = db.from("academy_sections").select("*").order("position");
  if (productId) query.eq("product_id", productId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sections: data });
}

export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { product_id?: string; title?: string; description?: string; position?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, title, description, position } = body;
  if (!product_id || !title) return NextResponse.json({ error: "product_id and title required" }, { status: 400 });

  // Auto-position at the end if not supplied
  let pos = position;
  if (pos === undefined) {
    const { count } = await db.from("academy_sections").select("*", { count: "exact", head: true }).eq("product_id", product_id);
    pos = count ?? 0;
  }

  const { data, error } = await db.from("academy_sections")
    .insert({ product_id, title, description, position: pos })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ section: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; title?: string; description?: string; position?: number; is_published?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await db.from("academy_sections").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ section: data });
}

export async function DELETE(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db.from("academy_sections").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
