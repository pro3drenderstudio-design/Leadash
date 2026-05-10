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

  const sectionId = req.nextUrl.searchParams.get("section_id");
  const productId = req.nextUrl.searchParams.get("product_id");

  let query = db.from("academy_lessons").select("*").order("position");
  if (sectionId) query = query.eq("section_id", sectionId);
  else if (productId) query = query.eq("product_id", productId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lessons: data });
}

export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    section_id?: string;
    product_id?: string;
    title?: string;
    lesson_type?: string;
    description?: string;
    position?: number;
    drip_type?: string;
    drip_value?: number;
    drip_date?: string;
    is_free_preview?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { section_id, product_id, title, lesson_type = "video", ...rest } = body;
  if (!section_id || !product_id || !title)
    return NextResponse.json({ error: "section_id, product_id, title required" }, { status: 400 });

  // Auto-position at end of section
  let pos = rest.position;
  if (pos === undefined) {
    const { count } = await db.from("academy_lessons").select("*", { count: "exact", head: true }).eq("section_id", section_id);
    pos = count ?? 0;
  }

  const { data, error } = await db.from("academy_lessons")
    .insert({ section_id, product_id, title, lesson_type, ...rest, position: pos, is_published: false })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lesson: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db.from("academy_lessons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
