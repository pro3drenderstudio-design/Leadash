/**
 * /api/admin/finance/projections
 *
 * Stores budget/projection rows (see lib/finance/projections.ts for how
 * recurring rows expand into per-period instances). GET optionally expands
 * for a given range via ?expand_start&expand_end; otherwise returns raw rows
 * for the management table.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, forbidden } from "../_helpers";
import { TYPES, CATEGORIES, type TxType } from "@/lib/finance/tax";
import { expandProjections, type StoredProjection } from "@/lib/finance/projections";

const VALID_TYPES = Object.keys(TYPES) as TxType[];
const VALID_RECURRENCE = ["once", "monthly", "quarterly", "yearly"];

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();

  const { data, error } = await ctx.db.from("finance_projections").select("*").order("start_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const p = req.nextUrl.searchParams;
  const expandStart = p.get("expand_start");
  const expandEnd = p.get("expand_end");

  const response: { projections: unknown[]; instances?: unknown[] } = { projections: data ?? [] };
  if (expandStart && expandEnd) {
    response.instances = expandProjections((data ?? []) as StoredProjection[], expandStart, expandEnd);
  }
  return NextResponse.json(response);
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if (!ctx) return forbidden();
  const body = await req.json() as {
    type?: TxType; category?: string; amount_ngn?: number; label?: string;
    recurrence?: string; start_date?: string; end_date?: string | null; bank_account_id?: string | null;
  };

  if (!body.type || !VALID_TYPES.includes(body.type)) return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(", ")}` }, { status: 400 });
  if (!body.category || !CATEGORIES[body.type]?.[body.category]) return NextResponse.json({ error: "Unknown category for this type" }, { status: 400 });
  const amount = Number(body.amount_ngn);
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "amount_ngn must be >= 0" }, { status: 400 });
  if (!body.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) return NextResponse.json({ error: "start_date (YYYY-MM-DD) is required" }, { status: 400 });
  const recurrence = body.recurrence ?? "once";
  if (!VALID_RECURRENCE.includes(recurrence)) return NextResponse.json({ error: `recurrence must be one of ${VALID_RECURRENCE.join(", ")}` }, { status: 400 });

  const { data, error } = await ctx.db.from("finance_projections").insert({
    type: body.type, category: body.category, amount_ngn: amount,
    label: body.label?.trim() || null, recurrence,
    start_date: body.start_date, end_date: body.end_date || null,
    bank_account_id: body.bank_account_id || null,
    created_by: ctx.user.id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ projection: data });
}
