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

export async function POST(req: NextRequest) {
  const db = await requireAdmin(req);
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { product_id?: string; name?: string; starts_at?: string; max_seats?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, name, starts_at, max_seats } = body;
  if (!product_id || !name || !starts_at) return NextResponse.json({ error: "product_id, name, starts_at required" }, { status: 400 });

  const { data, error } = await db.from("academy_cohorts").insert({
    product_id, name, starts_at, max_seats: max_seats ?? null, status: "upcoming",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cohort: data });
}

export async function PATCH(req: NextRequest) {
  const db = await requireAdmin(req);
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; status?: string; name?: string; starts_at?: string; max_seats?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await db.from("academy_cohorts").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cohort: data });
}
