import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { OfferDiscountCode } from "@/types/offers";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  return admin ? db : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: offerId } = await params;
  const { data, error } = await db
    .from("offer_discount_codes")
    .select("*")
    .eq("offer_id", offerId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: (data ?? []) as OfferDiscountCode[] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: offerId } = await params;
  let body: {
    code?: string;
    kind?: "percent" | "fixed";
    value?: number;
    max_redemptions?: number | null;
    manual_only?: boolean;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const code = body.code?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
  if (body.kind !== "percent" && body.kind !== "fixed") {
    return NextResponse.json({ error: "kind must be 'percent' or 'fixed'" }, { status: 400 });
  }
  if (typeof body.value !== "number" || body.value <= 0) {
    return NextResponse.json({ error: "value must be a positive number" }, { status: 400 });
  }

  const { data: existing } = await db
    .from("offer_discount_codes")
    .select("id")
    .eq("offer_id", offerId)
    .eq("code", code)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Discount code already exists for this offer" }, { status: 409 });

  const { data, error } = await db
    .from("offer_discount_codes")
    .insert({
      offer_id:        offerId,
      code,
      kind:            body.kind,
      value:           body.value,
      max_redemptions: body.max_redemptions ?? null,
      manual_only:     body.manual_only ?? false,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data as OfferDiscountCode }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: offerId } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const allowedKeys = ["value", "max_redemptions", "manual_only", "is_active"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No patchable fields in body" }, { status: 400 });
  }

  const { data, error } = await db
    .from("offer_discount_codes")
    .update(updates)
    .eq("id", id)
    .eq("offer_id", offerId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code: data as OfferDiscountCode });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await requireAdmin();
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: offerId } = await params;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await db.from("offer_discount_codes").delete().eq("id", id).eq("offer_id", offerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
