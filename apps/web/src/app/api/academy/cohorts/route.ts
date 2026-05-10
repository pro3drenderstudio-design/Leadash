import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/api/workspace";

export async function GET(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) return NextResponse.json({ error: "product_id required" }, { status: 400 });

  const { db } = auth;
  const { data: cohorts } = await db
    .from("academy_cohorts")
    .select("*")
    .eq("product_id", productId)
    .in("status", ["upcoming", "active"])
    .order("starts_at");

  return NextResponse.json({ cohorts: cohorts ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireWorkspace(req);
  if (!auth.ok) return auth.res;

  let body: { product_id?: string; name?: string; starts_at?: string; max_seats?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { product_id, name, starts_at, max_seats } = body;
  if (!product_id || !name || !starts_at) return NextResponse.json({ error: "product_id, name, and starts_at required" }, { status: 400 });

  const { db } = auth;
  const { data, error } = await db
    .from("academy_cohorts")
    .insert({ product_id, name, starts_at, max_seats: max_seats ?? null, status: "upcoming" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cohort: data });
}
