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
  let query = db.from("academy_discount_codes").select("*").order("created_at", { ascending: false });
  if (productId) query = query.or(`product_id.eq.${productId},product_id.is.null`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data });
}

export async function POST(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    code?: string;
    product_id?: string;
    discount_type?: "percent" | "fixed_ngn";
    discount_value?: number;
    max_uses?: number;
    expires_at?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { code, discount_type, discount_value } = body;
  if (!discount_type || discount_value === undefined)
    return NextResponse.json({ error: "discount_type and discount_value required" }, { status: 400 });

  const finalCode = (code ?? Math.random().toString(36).slice(2, 10)).toUpperCase();

  const { data, error } = await db.from("academy_discount_codes")
    .insert({ ...body, code: finalCode })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; is_active?: boolean; max_uses?: number; expires_at?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await db.from("academy_discount_codes").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data });
}

export async function DELETE(req: NextRequest) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db.from("academy_discount_codes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
