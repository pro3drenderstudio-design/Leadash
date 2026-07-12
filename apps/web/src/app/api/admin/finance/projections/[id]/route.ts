import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../../_helpers";
import { CATEGORIES, type TxType } from "@/lib/finance/tax";

const VALID_RECURRENCE = ["once", "monthly", "quarterly", "yearly"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  const { data: row } = await ctx.db.from("finance_projections").select("type").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.category !== undefined) {
    const effType = (body.type as TxType) ?? row.type;
    if (!CATEGORIES[effType]?.[body.category as string]) return NextResponse.json({ error: "Unknown category for this type" }, { status: 400 });
    patch.category = body.category;
  }
  if (body.type !== undefined) patch.type = body.type;
  if (body.amount_ngn !== undefined) {
    const amount = Number(body.amount_ngn);
    if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "amount_ngn must be >= 0" }, { status: 400 });
    patch.amount_ngn = amount;
  }
  if (body.label !== undefined) patch.label = body.label ? String(body.label).trim() : null;
  if (body.recurrence !== undefined) {
    if (!VALID_RECURRENCE.includes(body.recurrence as string)) return NextResponse.json({ error: `recurrence must be one of ${VALID_RECURRENCE.join(", ")}` }, { status: 400 });
    patch.recurrence = body.recurrence;
  }
  if (body.start_date !== undefined) patch.start_date = body.start_date;
  if (body.end_date !== undefined) patch.end_date = body.end_date || null;
  if (body.bank_account_id !== undefined) patch.bank_account_id = body.bank_account_id || null;

  if (!Object.keys(patch).length) return NextResponse.json({ error: "No recognized fields to update" }, { status: 400 });

  const { data, error } = await ctx.db.from("finance_projections").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projection: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const { id } = await params;
  const { error } = await ctx.db.from("finance_projections").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
