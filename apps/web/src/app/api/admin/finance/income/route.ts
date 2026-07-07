import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";

const TYPES = new Set(["plan","academy","offer","credits","addon","external","partner","consulting","grant"]);

// GET /api/admin/finance/income
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const { data, error } = await ctx.db.from("finance_income").select("*").order("date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ income: data ?? [] });
}

// POST /api/admin/finance/income
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json();

  const source_label = String(body.source_label ?? "").trim();
  const type         = String(body.type ?? "").trim();
  const amount       = Number(body.amount_ngn);
  const date         = String(body.date ?? "").trim();
  const is_test      = Boolean(body.is_test ?? false);

  if (!source_label)                    return NextResponse.json({ error: "Source is required" }, { status: 400 });
  if (!TYPES.has(type))                 return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Amount must be > 0" }, { status: 400 });
  if (!date)                            return NextResponse.json({ error: "Date is required" }, { status: 400 });

  const { data, error } = await ctx.db.from("finance_income")
    .insert({ source_label, type, amount_ngn: Math.round(amount), date, is_test, created_by: ctx.user.id })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ income: data });
}

// PATCH /api/admin/finance/income
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json();
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const patch: Record<string, string | number | boolean> = {};
  if (body.source_label !== undefined) patch.source_label = String(body.source_label).trim();
  if (body.type         !== undefined) {
    if (!TYPES.has(body.type)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    patch.type = body.type;
  }
  if (body.amount_ngn   !== undefined) {
    const amt = Number(body.amount_ngn);
    if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: "Amount must be > 0" }, { status: 400 });
    patch.amount_ngn = Math.round(amt);
  }
  if (body.date         !== undefined) patch.date = String(body.date);
  if (body.is_test      !== undefined) patch.is_test = Boolean(body.is_test);

  const { data, error } = await ctx.db.from("finance_income").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ income: data });
}

// DELETE /api/admin/finance/income?id=…
export async function DELETE(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await ctx.db.from("finance_income").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
